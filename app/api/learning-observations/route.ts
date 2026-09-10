import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import {
  collectPedagogyData,
  learningSessionSchema,
  readConsent,
} from '@/lib/telemetry/pedagogy-collector';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (
    request.headers.get('origin') !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  ) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  }
  try {
    // Reject before parsing measures; RPC repeats this check atomically at insert time.
    if ((await readConsent(auth.user.id)) !== true) {
      return NextResponse.json({ recorded: false }, { headers });
    }
  } catch {
    return NextResponse.json({ error: 'Consent unavailable' }, { status: 503, headers });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'JSON required' }, { status: 415, headers });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Invalid body' }, { status: 400, headers });
  let size = 0;
  let expired = false;
  const chunks: Uint8Array[] = [];
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  let input: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new Error('Body timeout');
      if (done) break;
      size += value.byteLength;
      if (size > 65536)
        return NextResponse.json({ error: 'Body too large' }, { status: 413, headers });
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const parsed = learningSessionSchema.safeParse(input);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid learning measures' }, { status: 400, headers });
  try {
    const recorded = await collectPedagogyData(auth.user.id, parsed.data);
    return NextResponse.json({ recorded }, { headers });
  } catch {
    return NextResponse.json({ error: 'Learning storage unavailable' }, { status: 503, headers });
  }
}

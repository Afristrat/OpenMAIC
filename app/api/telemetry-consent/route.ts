import { NextRequest, NextResponse } from 'next/server';
import { readConsentState, setConsent } from '@/lib/telemetry/pedagogy-collector';
import { requireAuth } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { telemetryConsentSchema } from '@/lib/api/schemas';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const requestedUser = request.nextUrl.searchParams.get('userId');
  if (requestedUser && requestedUser !== auth.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  try {
    const { choice, epoch } = await readConsentState(auth.user.id);
    return NextResponse.json({ choice, epoch, hasConsent: choice === true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Consent storage unavailable' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const origin = request.headers.get('origin');
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'JSON required' }, { status: 415, headers });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  let rawBody: unknown;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) throw new Error('Body timeout');
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        return NextResponse.json({ error: 'Body too large' }, { status: 413, headers });
      }
      chunks.push(value);
    }
    rawBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const validation = validateBody(telemetryConsentSchema, rawBody);
  if (!validation.success) return validation.response;
  const { consent } = validation.data;

  try {
    await setConsent(auth.user.id, consent);
    return NextResponse.json({ ok: true, choice: consent }, { headers });
  } catch {
    return NextResponse.json({ error: 'Consent storage unavailable' }, { status: 503, headers });
  }
}

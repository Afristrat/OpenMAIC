import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const recordSchema = z
  .object({
    id: z.string().uuid(),
    // The persisted prefix may belong to a deleted former author after a valid reclaim.
    storagePath: z.string().regex(/^[0-9a-f-]{36}\/course-imports\/[0-9a-f-]{36}\.(md|docx|pdf)$/i),
  })
  .strict();

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  if (!parsedId.success)
    return NextResponse.json({ error: 'Invalid import' }, { status: 400, headers });
  try {
    const service = createServiceSupabaseClient(
      AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    );
    const result = await service.rpc('read_account_import_download', {
      p_actor: auth.user.id,
      p_import: parsedId.data,
    });
    if (result.error) throw new Error('Import lookup unavailable');
    if (!result.data)
      return NextResponse.json({ error: 'Import not found' }, { status: 404, headers });
    const record = recordSchema.parse(result.data);
    if (record.id !== parsedId.data) throw new Error('Import identity mismatch');
    // Direct Storage delivery avoids buffering uploaded documents in the web process.
    // Already-issued links remain usable for up to 60 seconds after access changes.
    const signed = await service.storage
      .from('classroom-media')
      .createSignedUrl(record.storagePath, 60, { download: true });
    if (signed.error || !signed.data?.signedUrl) throw new Error('Import download unavailable');
    const target = new URL(signed.data.signedUrl);
    if (
      target.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
      !['http:', 'https:'].includes(target.protocol)
    ) {
      throw new Error('Invalid storage origin');
    }
    return new NextResponse(null, { status: 303, headers: { ...headers, Location: target.href } });
  } catch {
    return NextResponse.json({ error: 'Import download unavailable' }, { status: 503, headers });
  }
}

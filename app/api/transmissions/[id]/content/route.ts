import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { privateArtifactUrl } from '@/lib/server/private-artifact-url';

const log = createLogger('TransmissionContentAPI');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id } = await context.params;
  const { data: transmission, error } = await supabase
    .from('transmissions')
    .select('id, status, source_artifact_path, visual_watermark_path')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.error('Transmission content lookup failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la transmission');
  }
  if (!transmission) return apiError('INVALID_REQUEST', 404, 'Transmission introuvable');
  if (
    transmission.status !== 'done' ||
    !transmission.source_artifact_path ||
    !transmission.visual_watermark_path
  ) {
    return apiError('INVALID_REQUEST', 409, 'La transmission n’est pas encore prête');
  }

  try {
    if (transmission.visual_watermark_path !== `${transmission.id}/visual-watermark.mp4`)
      throw new Error();
    const target = await privateArtifactUrl(
      'transmissions',
      transmission.visual_watermark_path,
      request.signal,
      request.nextUrl.searchParams.get('download') === '1',
    );
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: target,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return apiError('INTERNAL_ERROR', 503, 'Impossible de diffuser le support');
  }
}

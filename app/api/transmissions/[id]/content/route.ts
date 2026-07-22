import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('TransmissionContentAPI');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id } = await context.params;
  const { data: transmission, error } = await supabase
    .from('transmissions')
    .select('status, source_artifact_path')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.error('Transmission content lookup failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la transmission');
  }
  if (!transmission) return apiError('INVALID_REQUEST', 404, 'Transmission introuvable');
  if (transmission.status !== 'done' || !transmission.source_artifact_path) {
    return apiError('INVALID_REQUEST', 409, 'La transmission n’est pas encore prête');
  }

  const { data: artifact, error: downloadError } = await createServiceSupabaseClient()
    .storage.from('transmissions')
    .download(transmission.source_artifact_path);
  if (downloadError || !artifact) {
    log.error('Transmission source download failed', downloadError?.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de diffuser le support');
  }

  return new NextResponse(artifact, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'Content-Length': String(artifact.size),
      'Content-Type': 'video/mp4',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

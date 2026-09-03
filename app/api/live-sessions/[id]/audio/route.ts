import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const log = createLogger('LiveSessionAudioAPI');

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const path = new URL(request.url).searchParams.get('path');
  if (!path) return apiError('INVALID_REQUEST', 400, 'Piste audio invalide');
  const { id } = await context.params;
  const { data: event, error } = await supabase
    .from('session_events')
    .select('audio_path')
    .eq('session_id', id)
    .eq('audio_path', path)
    .maybeSingle();
  if (error) {
    log.error('Session audio authorization failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la piste audio');
  }
  if (!event) return apiError('INVALID_REQUEST', 404, 'Piste audio introuvable');

  const { data, error: downloadError } = await supabase.storage
    .from('session-audio')
    .download(path);
  if (downloadError || !data) {
    log.error('Session audio download failed', downloadError?.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la piste audio');
  }
  return new NextResponse(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'Content-Length': String(data.size),
      'Content-Type': data.type || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

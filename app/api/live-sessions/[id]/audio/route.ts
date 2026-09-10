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
  try {
    // Keep the user-scoped Storage client: its session policy is checked again.
    // Direct delivery supports byte ranges without buffering the track in Next.js.
    // Issued URLs remain valid for up to 60 seconds after access changes.
    const { data, error: signError } = await supabase.storage
      .from('session-audio')
      .createSignedUrl(path, 60, {
        download: new URL(request.url).searchParams.get('download') === '1',
      });
    if (signError || !data?.signedUrl) throw new Error('Audio signing unavailable');
    const target = new URL(data.signedUrl);
    if (
      target.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
      !['http:', 'https:'].includes(target.protocol)
    )
      throw new Error('Invalid storage origin');
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: target.href,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return apiError('INTERNAL_ERROR', 503, 'Impossible de lire la piste audio');
  }
}

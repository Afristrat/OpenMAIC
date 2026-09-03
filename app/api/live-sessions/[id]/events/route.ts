import type { NextRequest } from 'next/server';
import { parseLiveSessionEvent } from '@/lib/live-session/contracts';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const log = createLogger('LiveSessionEventsAPI');

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await context.params;
  const { data, error } = await supabase
    .from('session_events')
    .select('id, ts_ms, actor, event_type, payload, audio_path, audio_bytes')
    .eq('session_id', id)
    .order('ts_ms', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    log.error('Session event listing failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire le replay');
  }
  return apiSuccess({ events: data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await context.params;

  let event;
  let audio: Blob | null = null;
  try {
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await request.formData();
      const rawEvent = form.get('event');
      const rawAudio = form.get('audio');
      if (typeof rawEvent !== 'string' || !(rawAudio instanceof Blob)) throw new Error();
      if (
        !rawAudio.type.startsWith('audio/') ||
        rawAudio.size === 0 ||
        rawAudio.size > 25_000_000
      ) {
        throw new Error();
      }
      event = parseLiveSessionEvent({
        ...(JSON.parse(rawEvent) as Record<string, unknown>),
        audioPath: null,
        audioBytes: 0,
      });
      audio = rawAudio;
    } else {
      event = parseLiveSessionEvent(await request.json());
    }
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Événement de session invalide');
  }

  const { data: session, error: sessionError } = await supabase
    .from('live_sessions')
    .select('id, recorded')
    .eq('id', id)
    .maybeSingle();
  if (sessionError) {
    log.error('Live session lookup failed', sessionError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible d’enregistrer l’événement');
  }
  if (!session) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  if (!session.recorded) {
    return apiError('INVALID_REQUEST', 409, 'Cette session n’est pas enregistrée');
  }

  let audioPath: string | null = event.audioPath;
  let audioBytes = event.audioBytes;
  if (audio) {
    const extension =
      audio.type === 'audio/wav'
        ? 'wav'
        : audio.type.includes('ogg')
          ? 'ogg'
          : audio.type.includes('mpeg')
            ? 'mp3'
            : 'webm';
    audioPath = `${user.id}/${id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('session-audio')
      .upload(audioPath, audio, { contentType: audio.type, upsert: false });
    if (uploadError) {
      log.error('Session audio upload failed', uploadError.message);
      return apiError('INTERNAL_ERROR', 500, 'Impossible d’enregistrer la piste audio');
    }
    audioBytes = audio.size;
  }

  const { data, error } = await supabase
    .from('session_events')
    .insert({
      session_id: id,
      ts_ms: event.tsMs,
      actor: event.actor,
      event_type: event.eventType,
      payload: event.payload,
      audio_path: audioPath,
      audio_bytes: audioBytes,
    })
    .select('id')
    .single();
  if (error || !data) {
    if (audioPath && audio) await supabase.storage.from('session-audio').remove([audioPath]);
    log.error('Session event append failed', error?.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible d’enregistrer l’événement');
  }
  return apiSuccess({ event: data }, 201);
}

import type { NextRequest } from 'next/server';
import { parseReplayPosition } from '@/lib/live-session/contracts';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const log = createLogger('LiveSessionDetailAPI');

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await context.params;
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id, recorded, started_at, ended_at, last_position_ms, courses(title, stage_id), session_events(id, ts_ms, actor, event_type, payload, audio_path, audio_bytes)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.error('Live session read failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la session');
  }
  if (!data) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  return apiSuccess({ session: data });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  let changes: { last_position_ms: number } | { ended_at: string };
  try {
    changes =
      body?.ended === true
        ? { ended_at: new Date().toISOString() }
        : { last_position_ms: parseReplayPosition(body).positionMs };
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Position de replay invalide');
  }
  const { id } = await context.params;
  const { data, error } = await supabase
    .from('live_sessions')
    .update(changes)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    log.error('Live session update failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de mettre à jour la session');
  }
  if (!data) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  return apiSuccess({ session: data });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await context.params;
  const { data: tracks, error: tracksError } = await supabase
    .from('session_events')
    .select('audio_path')
    .eq('session_id', id);
  if (tracksError) {
    log.error('Session audio listing failed', tracksError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de supprimer la session');
  }
  const paths = (tracks ?? [])
    .map((track) => track.audio_path)
    .filter((path): path is string => typeof path === 'string');
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from('session-audio').remove(paths);
    if (removeError) {
      log.error('Session audio deletion failed', removeError.message);
      return apiError('INTERNAL_ERROR', 500, 'Impossible de supprimer les pistes audio');
    }
  }
  const { data, error } = await supabase
    .from('live_sessions')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    log.error('Live session deletion failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de supprimer la session');
  }
  if (!data) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  return apiSuccess({ id });
}

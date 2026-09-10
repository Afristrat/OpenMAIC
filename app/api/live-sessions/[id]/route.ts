import type { NextRequest } from 'next/server';
import { parseReplayPosition } from '@/lib/live-session/contracts';
import { enqueueAnchorSessionStatement } from '@/lib/anchoring/xapi-outbox';
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
  const xapiQueued =
    body?.ended === true
      ? await enqueueAnchorSessionStatement({ sessionId: id, userId: user.id }).catch(() => false)
      : false;
  return apiSuccess({ session: data, xapiQueued });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await context.params;
  // The cascade revokes replay access atomically. The retention worker removes
  // orphaned audio in bounded, retryable batches, including late uploads.
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
  return apiSuccess({ id, audioCleanup: 'pending' });
}

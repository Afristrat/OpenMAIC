/**
 * POST /api/capture/ingest/sessions/[id]/complete : clôt la session une fois toutes les étapes
 * déposées. Une session sans étape ne se clôt pas : elle n'a rien à valider.
 */

import { NextRequest } from 'next/server';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureCompleteAPI');

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;
  const { id: sessionId } = await context.params;

  const supabase = createServiceSupabaseClient();
  const { data: session } = await supabase
    .from('capture_sessions')
    .select('id, status, step_count')
    .eq('id', sessionId)
    .eq('owner_id', auth.ownerId)
    .maybeSingle();
  if (!session) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  if (session.status === 'complete')
    return apiSuccess({ id: sessionId, stepCount: session.step_count });
  if ((session.step_count as number) < 1) {
    return apiError('INVALID_REQUEST', 409, 'Aucune étape déposée : rien à clôturer');
  }

  const { error } = await supabase
    .from('capture_sessions')
    .update({ status: 'complete' })
    .eq('id', sessionId)
    .eq('status', 'receiving');
  if (error) {
    log.error('Failed to complete capture session', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la clôture de la session');
  }
  return apiSuccess({ id: sessionId, stepCount: session.step_count });
}

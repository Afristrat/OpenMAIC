import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { enqueueAnchorEvaluationStatement } from '@/lib/anchoring/xapi-outbox';
import {
  hotJourneyEvaluationSchema,
  normalizeJourneyEvaluation,
} from '@/lib/anchoring/journey-evaluation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const parsed = hotJourneyEvaluationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError('INVALID_REQUEST', 400, 'Réponses invalides');
  }

  const { id } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('live_sessions')
    .select('id, ended_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (sessionError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la session');
  if (!session?.ended_at) {
    return apiError('INVALID_REQUEST', 409, 'La session doit être terminée avant son évaluation');
  }

  const { answers, score } = normalizeJourneyEvaluation(parsed.data);
  const { data, error } = await supabase
    .from('evaluations')
    .insert({
      session_id: id,
      user_id: user.id,
      phase: 'hot',
      answers,
      score,
    })
    .select('id, phase, score')
    .single();
  if (error?.code === '23505') {
    return apiError('INVALID_REQUEST', 409, 'Cette évaluation a déjà été envoyée');
  }
  if (error || !data) return apiError('INTERNAL_ERROR', 500, 'Échec de l’évaluation');
  const xapiQueued =
    score === null
      ? false
      : await enqueueAnchorEvaluationStatement({
          sessionId: id,
          userId: user.id,
          phase: 'hot',
          score,
        }).catch(() => false);
  return apiSuccess({ evaluation: data, xapiQueued }, 201);
}

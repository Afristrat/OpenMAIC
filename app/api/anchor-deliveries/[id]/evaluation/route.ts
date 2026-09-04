import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { enqueueAnchorEvaluationStatement } from '@/lib/anchoring/xapi-outbox';

const evaluationSchema = z
  .object({ useful: z.number().int().min(1).max(5), confidence: z.number().int().min(1).max(5) })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = evaluationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError('INVALID_REQUEST', 400, 'Les deux réponses de 1 à 5 sont requises');
  }
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await params;
  const { data: delivery, error: deliveryError } = await auth
    .from('anchor_deliveries')
    .select('id, delivery_kind, payload, anchor_plans(session_id, user_id)')
    .eq('id', id)
    .maybeSingle();
  if (deliveryError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture du rappel');
  const planValue = delivery?.anchor_plans;
  const plan = Array.isArray(planValue) ? planValue[0] : planValue;
  const payload = (delivery?.payload ?? {}) as Record<string, unknown>;
  const phase = payload.phase;
  if (
    !delivery ||
    delivery.delivery_kind !== 'cold_eval' ||
    !plan ||
    plan.user_id !== user.id ||
    (phase !== 'cold_30' && phase !== 'cold_60')
  ) {
    return apiError('INVALID_REQUEST', 404, 'Évaluation froide introuvable');
  }
  const score = ((parsed.data.useful + parsed.data.confidence) / 10) * 100;
  const { data: evaluation, error } = await auth
    .from('evaluations')
    .insert({
      session_id: plan.session_id,
      user_id: user.id,
      phase,
      answers: parsed.data,
      score,
    })
    .select('id, phase, score')
    .single();
  if (error?.code === '23505') {
    return apiError('INVALID_REQUEST', 409, 'Cette évaluation a déjà été envoyée');
  }
  if (error || !evaluation) return apiError('INTERNAL_ERROR', 500, 'Échec de l’évaluation');
  const service = createServiceSupabaseClient();
  await service
    .from('anchor_deliveries')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', id)
    .not('sent_at', 'is', null);
  const xapiQueued = await enqueueAnchorEvaluationStatement({
    sessionId: plan.session_id,
    userId: user.id,
    phase,
    score,
  }).catch(() => false);
  return apiSuccess({ evaluation, xapiQueued }, 201);
}

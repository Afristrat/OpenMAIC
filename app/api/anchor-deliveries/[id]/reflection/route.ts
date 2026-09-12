import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const reflectionSchema = z
  .object({
    responseKind: z.enum(['active_recall', 'open_question', 'action_in_practice']),
    responseText: z.string().trim().min(1).max(2000),
  })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = reflectionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError('INVALID_REQUEST', 400, 'Réponse de relance invalide');

  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id } = await params;
  const { data: delivery, error: deliveryError } = await auth
    .from('anchor_deliveries')
    .select('id, seed_id, sent_at, anchor_plans(user_id)')
    .eq('id', id)
    .maybeSingle();
  if (deliveryError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture du rappel');
  const planValue = delivery?.anchor_plans;
  const plan = Array.isArray(planValue) ? planValue[0] : planValue;
  if (!delivery?.seed_id || !delivery.sent_at || !plan || plan.user_id !== user.id) {
    return apiError('INVALID_REQUEST', 404, 'Relance disponible introuvable');
  }

  const service = createServiceSupabaseClient();
  const { data: reflection, error } = await service
    .from('anchor_reflections')
    .insert({
      delivery_id: delivery.id,
      seed_id: delivery.seed_id,
      user_id: user.id,
      response_kind: body.data.responseKind,
      response_text: body.data.responseText,
    })
    .select('id, response_kind, resolved_at')
    .single();
  if (error?.code === '23505') {
    return apiError('INVALID_REQUEST', 409, 'Cette relance a déjà reçu une réponse résolue');
  }
  if (error || !reflection)
    return apiError('INTERNAL_ERROR', 500, 'Échec d’enregistrement de la réponse');
  return apiSuccess({ reflection }, 201);
}

/**
 * PATCH /api/capture/steps/[stepId] : l'auteur valide, rejette ou remet en attente une étape.
 *
 * Seule une étape « approved » entre dans la consigne du plan. Le propriétaire est vérifié par la
 * session de l'étape ; une étape d'un autre auteur répond 404, sans indice sur son existence.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureStepReviewAPI');

const bodySchema = z.strictObject({ review: z.enum(['pending', 'approved', 'rejected']) });

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const stepId = z.uuid().safeParse((await ctx.params).stepId);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!stepId.success || !body.success) return apiError('INVALID_REQUEST', 400, 'Requête invalide');

  const supabase = createServiceSupabaseClient();
  const { data: step } = await supabase
    .from('capture_steps')
    .select('id, session_id')
    .eq('id', stepId.data)
    .maybeSingle();
  const { data: session } = step
    ? await supabase
        .from('capture_sessions')
        .select('id')
        .eq('id', step.session_id as string)
        .eq('owner_id', auth.user.id)
        .maybeSingle()
    : { data: null };
  if (!step || !session) return apiError('INVALID_REQUEST', 404, 'Étape introuvable');

  const { error } = await supabase
    .from('capture_steps')
    .update({
      review: body.data.review,
      reviewed_at: body.data.review === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', stepId.data);
  if (error) {
    log.error('Failed to review capture step', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la validation');
  }
  return apiSuccess({ id: stepId.data, review: body.data.review });
}

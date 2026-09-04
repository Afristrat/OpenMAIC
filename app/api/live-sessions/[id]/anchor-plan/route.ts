import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { buildAnchorSchedule } from '@/lib/anchoring/schedule';
import { isFeatureEnabled } from '@/lib/flags';
import { enqueueAnchorDelivery } from '@/lib/jobs/queue';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const optInSchema = z.object({ optedIn: z.literal(true) }).strict();
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFeatureEnabled('anchoring'))) {
    return apiError('INVALID_REQUEST', 404, 'Ancrage indisponible');
  }
  const parsed = optInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Consentement explicite requis');

  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id: sessionId } = await params;
  const { data: session, error: sessionError } = await auth
    .from('live_sessions')
    .select('id, ended_at, recorded, course_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (sessionError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la session');
  if (!session?.ended_at || !session.recorded) {
    return apiError('INVALID_REQUEST', 409, 'Une session enregistrée et terminée est requise');
  }

  const service = createServiceSupabaseClient();
  const { data: course, error: courseError } = await service
    .from('courses')
    .select('stage_id')
    .eq('id', session.course_id)
    .single();
  if (courseError || !course?.stage_id) {
    return apiError('INVALID_REQUEST', 409, 'Le support de session est introuvable');
  }
  const { data: reviewCards, error: reviewCardError } = await service
    .from('review_cards')
    .select('id')
    .eq('user_id', user.id)
    .eq('source_stage_id', course.stage_id)
    .order('due_date', { ascending: true });
  if (reviewCardError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture des quiz espacés');
  const { data: seeds, error: seedError } = await service
    .from('seeds')
    .select('id, kind')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (seedError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture du stock d’ancrage');
  if (!seeds || seeds.length < 12) {
    return apiError(
      'INVALID_REQUEST',
      409,
      'Le stock d’ancrage complet doit être généré avant l’activation',
    );
  }

  const optedInAt = new Date();
  const schedule = buildAnchorSchedule(
    optedInAt,
    seeds.map((seed) => seed.id),
  );
  const { data: plan, error: planError } = await auth
    .from('anchor_plans')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      opted_in_at: optedInAt.toISOString(),
      ends_at: new Date(optedInAt.getTime() + 90 * DAY_MS).toISOString(),
    })
    .select('id, opted_in_at, ends_at, paused')
    .single();
  if (planError?.code === '23505') {
    return apiError('INVALID_REQUEST', 409, 'Un plan d’ancrage existe déjà pour cette session');
  }
  if (planError || !plan)
    return apiError('INTERNAL_ERROR', 500, 'Échec de création du plan d’ancrage');

  try {
    const kinds = new Map(seeds.map((seed) => [seed.id, seed.kind]));
    let quizReminderIndex = 0;
    const { data: deliveries, error: deliveryError } = await service
      .from('anchor_deliveries')
      .insert(
        schedule.map((item) => ({
          plan_id: plan.id,
          seed_id: item.kind === 'seed' ? item.seedId : null,
          delivery_kind:
            item.kind === 'cold_eval'
              ? 'cold_eval'
              : kinds.get(item.seedId) === 'quiz_reminder'
                ? 'quiz_reminder'
                : 'seed',
          scheduled_for: item.scheduledFor.toISOString(),
          dedupe_key: item.dedupeKey,
          payload:
            item.kind === 'cold_eval'
              ? { phase: item.phase }
              : kinds.get(item.seedId) === 'quiz_reminder' && reviewCards?.length
                ? { review_card_id: reviewCards[quizReminderIndex++ % reviewCards.length].id }
                : {},
        })),
      )
      .select('id, scheduled_for');
    if (deliveryError || !deliveries) {
      throw new Error(deliveryError?.message ?? 'Anchor deliveries were not created');
    }
    await Promise.all(
      deliveries.map((delivery) =>
        enqueueAnchorDelivery({ deliveryId: delivery.id }, new Date(delivery.scheduled_for)),
      ),
    );
    return apiSuccess({ plan, deliveryCount: deliveries.length }, 201);
  } catch {
    await service.from('anchor_plans').delete().eq('id', plan.id);
    return apiError('INTERNAL_ERROR', 500, 'Échec de planification de l’ancrage');
  }
}

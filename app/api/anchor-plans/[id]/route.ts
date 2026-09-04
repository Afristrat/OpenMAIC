import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { enqueueAnchorDelivery } from '@/lib/jobs/queue';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const updateSchema = z.object({ paused: z.boolean() }).strict();

async function ownedPlan(id: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, plan: null, unauthorized: true };
  const { data: plan } = await supabase
    .from('anchor_plans')
    .select('id, session_id, opted_in_at, ends_at, paused')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  return { supabase, plan, unauthorized: false };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { plan, unauthorized } = await ownedPlan(id);
  if (unauthorized) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  if (!plan) return apiError('INVALID_REQUEST', 404, 'Plan d’ancrage introuvable');
  return apiSuccess({ plan });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'État de pause invalide');
  const { id } = await params;
  const { supabase, plan, unauthorized } = await ownedPlan(id);
  if (unauthorized) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  if (!plan) return apiError('INVALID_REQUEST', 404, 'Plan d’ancrage introuvable');

  const { data: updated, error } = await supabase
    .from('anchor_plans')
    .update({ paused: parsed.data.paused })
    .eq('id', id)
    .select('id, paused, ends_at')
    .single();
  if (error || !updated) return apiError('INTERNAL_ERROR', 500, 'Échec de mise à jour du plan');

  if (!updated.paused) {
    const { data: deliveries, error: deliveryError } = await supabase
      .from('anchor_deliveries')
      .select('id, scheduled_for')
      .eq('plan_id', id)
      .is('sent_at', null)
      .lte('scheduled_for', updated.ends_at);
    if (deliveryError) return apiError('INTERNAL_ERROR', 500, 'Échec de reprise des envois');
    await Promise.all(
      (deliveries ?? []).map((delivery) =>
        enqueueAnchorDelivery({ deliveryId: delivery.id }, new Date(delivery.scheduled_for)),
      ),
    );
  }
  return apiSuccess({ plan: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, plan, unauthorized } = await ownedPlan(id);
  if (unauthorized) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  if (!plan) return apiError('INVALID_REQUEST', 404, 'Plan d’ancrage introuvable');
  const { error } = await supabase.from('anchor_plans').delete().eq('id', id);
  if (error) return apiError('INTERNAL_ERROR', 500, 'Échec de l’arrêt du plan');
  return apiSuccess({ deleted: true });
}

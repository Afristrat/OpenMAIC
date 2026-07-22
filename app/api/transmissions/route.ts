import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { enqueueTransmission } from '@/lib/jobs/queue';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('TransmissionsAPI');

interface CreateTransmissionBody {
  stageId?: unknown;
  recipientUserId?: unknown;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { data, error } = await supabase
    .from('transmissions')
    .select('id, stage_id, sender_user_id, recipient_user_id, status, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) {
    log.error('Transmission listing failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lister les transmissions');
  }
  return apiSuccess({ transmissions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreateTransmissionBody | null;
  if (!body || !isValidClassroomId(body.stageId as string) || !isUuid(body.recipientUserId)) {
    return apiError('INVALID_REQUEST', 400, 'Classroom ou destinataire invalide');
  }

  const ownership = await readClassroomOwnership(body.stageId as string);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');

  const auth = await requireSuperAdminOrOrgAdmin(request, ownership.orgId);
  if (auth.response) return auth.response;
  if (auth.user.id === body.recipientUserId) {
    return apiError('INVALID_REQUEST', 400, 'L’émetteur et le destinataire doivent être distincts');
  }

  const service = createServiceSupabaseClient();
  const { data: recipientMembership, error: membershipError } = await service
    .from('org_members')
    .select('user_id')
    .eq('org_id', ownership.orgId)
    .eq('user_id', body.recipientUserId)
    .maybeSingle();
  if (membershipError) {
    log.error('Recipient membership lookup failed', membershipError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de vérifier le destinataire');
  }
  if (!recipientMembership) {
    return apiError(
      'INVALID_REQUEST',
      404,
      'Le destinataire ne fait pas partie de cette organisation',
    );
  }

  const { data: existing, error: existingError } = await service
    .from('transmissions')
    .select('id, status')
    .eq('stage_id', body.stageId)
    .eq('sender_user_id', auth.user.id)
    .eq('recipient_user_id', body.recipientUserId)
    .maybeSingle();
  if (existingError) {
    log.error('Transmission idempotency lookup failed', existingError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de créer la transmission');
  }
  if (existing) {
    return apiSuccess({
      id: existing.id,
      status: existing.status,
      existing: true,
      url: new URL(`/transmissions/${existing.id}`, request.url).toString(),
    });
  }

  const { data: transmission, error: insertError } = await service
    .from('transmissions')
    .insert({
      stage_id: body.stageId,
      sender_user_id: auth.user.id,
      recipient_user_id: body.recipientUserId,
    })
    .select('id, status')
    .single();
  if (insertError || !transmission) {
    log.error('Transmission insert failed', insertError?.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de créer la transmission');
  }

  try {
    await enqueueTransmission({ transmissionId: transmission.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await service
      .from('transmissions')
      .update({ status: 'failed', error: message })
      .eq('id', transmission.id);
    log.error('Transmission enqueue failed', message);
    return apiError('INTERNAL_ERROR', 503, 'La file de transmission est indisponible');
  }

  return apiSuccess(
    {
      id: transmission.id,
      status: transmission.status,
      existing: false,
      url: new URL(`/transmissions/${transmission.id}`, request.url).toString(),
    },
    202,
  );
}

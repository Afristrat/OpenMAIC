import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { classroomEditDelegationDecisionSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import { createLogger } from '@/lib/logger';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import {
  readClassroomEditDelegationState,
  type ClassroomEditDelegationStatus,
} from '@/lib/server/classroom-edit-delegations';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('ClassroomEditAccess');

async function resolveContext(request: NextRequest, classroomId: string) {
  if (!isValidClassroomId(classroomId)) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Classroom invalide') };
  }
  const auth = await requireAuth(request);
  if (auth.response) return { response: auth.response };
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom introuvable') };
  }
  const state = await readClassroomEditDelegationState(classroomId, ownership.orgId, auth.user.id);
  if (!state.role) {
    return {
      response: apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Accès au tenant requis'),
    };
  }
  return { auth, ownership, state };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveContext(request, classroomId);
    if ('response' in context) return context.response;
    return apiSuccess({ editAccess: context.state });
  } catch (error) {
    log.error('Failed to read classroom edit access', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de lecture des autorisations');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveContext(request, classroomId);
    if ('response' in context) return context.response;
    if (!context.state.canRequest) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        403,
        'Seul un formateur peut demander cette autorisation',
      );
    }
    const now = Date.now();
    const alreadyOpen = context.state.requests.some(
      (item) =>
        item.status === 'pending' ||
        (item.status === 'approved' && item.expiresAt && Date.parse(item.expiresAt) > now),
    );
    if (alreadyOpen) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Une demande ou une autorisation active existe déjà',
      );
    }

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('classroom_edit_delegations')
      .insert({
        stage_id: classroomId,
        org_id: context.ownership.orgId,
        requester_id: context.auth.user.id,
      })
      .select('id')
      .single();
    if (error || !data) {
      if (error?.code === '23505') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Une demande est déjà en attente');
      }
      throw new Error(error?.message ?? 'Delegation request was not created');
    }
    return apiSuccess({ requestId: data.id }, 201);
  } catch (error) {
    log.error('Failed to request classroom edit access', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de création de la demande');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveContext(request, classroomId);
    if ('response' in context) return context.response;
    if (!context.state.canManage) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        403,
        'Accès administrateur ou manager requis',
      );
    }

    const validation = validateBody(
      classroomEditDelegationDecisionSchema,
      await request.json().catch(() => null),
    );
    if (!validation.success) return validation.response;
    const decision = validation.data;
    const current = context.state.requests.find((item) => item.id === decision.requestId);
    const expectedStatus: ClassroomEditDelegationStatus =
      decision.action === 'revoke' ? 'approved' : 'pending';
    if (!current || current.status !== expectedStatus) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Cette demande a déjà été traitée ou a changé',
      );
    }

    const decidedAt = new Date();
    const update =
      decision.action === 'approve'
        ? {
            status: 'approved' as const,
            decided_by: context.auth.user.id,
            decided_at: decidedAt.toISOString(),
            expires_at: new Date(
              decidedAt.getTime() + decision.durationHours * 60 * 60 * 1000,
            ).toISOString(),
          }
        : decision.action === 'reject'
          ? {
              status: 'rejected' as const,
              decided_by: context.auth.user.id,
              decided_at: decidedAt.toISOString(),
            }
          : {
              status: 'revoked' as const,
              revoked_by: context.auth.user.id,
              revoked_at: decidedAt.toISOString(),
            };

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('classroom_edit_delegations')
      .update(update)
      .eq('id', decision.requestId)
      .eq('stage_id', classroomId)
      .eq('org_id', context.ownership.orgId)
      .eq('status', expectedStatus)
      .select('id, status, expires_at')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Cette demande a déjà été traitée ou a changé',
      );
    }
    return apiSuccess({ delegation: data });
  } catch (error) {
    log.error('Failed to decide classroom edit access', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de mise à jour de l’autorisation');
  }
}

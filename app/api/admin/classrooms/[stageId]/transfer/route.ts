import { requireSuperAdmin } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refus métier levés par la fonction de base, avec le statut HTTP qui leur correspond. */
const DOMAIN_ERRORS: ReadonlyArray<readonly [string, number, string]> = [
  ['STAGE_NOT_FOUND', 404, 'Classroom not found'],
  ['SAME_ORGANIZATION', 409, 'The classroom already belongs to this organization'],
  ['TARGET_ORGANIZATION_INACTIVE', 409, 'The target organization is not active'],
  ['NEW_OWNER_NOT_ELIGIBLE', 409, 'The new owner must be an author-level member of the target'],
  ['MULTIPLE_COURSES', 409, 'The classroom is linked to several courses'],
];

/** Affecte une formation à une autre organisation et à une personne désignée (super-administrateur). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  let body: { toOrgId?: unknown; newOwnerId?: unknown };
  try {
    body = (await request.json()) as { toOrgId?: unknown; newOwnerId?: unknown };
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }
  const { toOrgId, newOwnerId } = body;
  if (
    typeof toOrgId !== 'string' ||
    typeof newOwnerId !== 'string' ||
    !UUID.test(toOrgId) ||
    !UUID.test(newOwnerId)
  ) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'toOrgId and newOwnerId required');
  }

  const { stageId } = await params;
  const { data, error } = await createServiceSupabaseClient().rpc(
    'transfer_classroom_to_organization',
    { p_actor: auth.user.id, p_stage: stageId, p_to_org: toOrgId, p_new_owner: newOwnerId },
  );
  if (error) {
    const known = DOMAIN_ERRORS.find(([code]) => error.message.includes(code));
    if (known) return apiError(API_ERROR_CODES.INVALID_REQUEST, known[1], known[2]);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to transfer classroom');
  }
  return apiSuccess({ transfer: data });
}

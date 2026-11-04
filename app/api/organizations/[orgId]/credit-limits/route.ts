/**
 * Plafonds mensuels de crédits par membre
 *
 * GET /api/organizations/[orgId]/credit-limits — membres, plafond et consommation du mois
 * PUT /api/organizations/[orgId]/credit-limits — fixe ou retire des plafonds (admin ou gestionnaire)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { requireOrgAdmin } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { listMemberCredits, setMemberCreditLimits } from '@/lib/server/member-credit-limits';

const log = createLogger('CreditLimits');

const putSchema = z.object({
  limits: z
    .array(
      z.object({
        userId: z.string().uuid(),
        // Un plafond à 0 interdit toute consommation ; null retire le plafond.
        capCredits: z.number().min(0).max(1_000_000_000).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

type Params = { params: Promise<{ orgId: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  const { orgId } = await params;
  const auth = await requireOrgAdmin(request, orgId);
  if (auth.response) return auth.response;
  try {
    return apiSuccess({ members: await listMemberCredits(orgId) });
  } catch (error) {
    log.error('List member credit limits failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load credit limits');
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const { orgId } = await params;
  const auth = await requireOrgAdmin(request, orgId);
  if (auth.response) return auth.response;

  const validation = validateBody(putSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  try {
    const result = await setMemberCreditLimits(orgId, validation.data.limits, auth.user.id);
    if (result.status === 'not-member') {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        404,
        'Member not found in this organization',
      );
    }
    return apiSuccess({ members: await listMemberCredits(orgId) });
  } catch (error) {
    log.error('Set member credit limits failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to save credit limits');
  }
}

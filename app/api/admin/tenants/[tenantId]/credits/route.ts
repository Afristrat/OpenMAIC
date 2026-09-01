import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { adminTenantCreditSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import {
  creditsToMicrounits,
  microunitsToCredits,
  postTenantCreditEntry,
} from '@/lib/billing/credits';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }
  const validation = validateBody(adminTenantCreditSchema, body);
  if (!validation.success) return validation.response;

  try {
    const { tenantId } = await params;
    const result = await postTenantCreditEntry({
      actorUserId: auth.user.id,
      tenantId,
      entryType: validation.data.entryType,
      deltaMicrounits: creditsToMicrounits(validation.data.amountCredits),
      idempotencyKey: validation.data.idempotencyKey,
      reason: validation.data.reason,
    });
    return apiSuccess({
      ...result,
      balanceCredits: microunitsToCredits(result.balanceMicrounits),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Credit ledger mutation failed';
    const conflict = /INSUFFICIENT|IDEMPOTENCY|DIVERGENCE/i.test(message);
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      conflict ? 409 : 500,
      conflict ? 'Credit entry rejected' : 'Failed to update tenant credits',
      message,
    );
  }
}

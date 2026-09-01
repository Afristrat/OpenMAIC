import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { adminTenantUsageBillingSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import {
  configureTenantUsageBilling,
  createTenantCreditBurnRate,
  getTenantUsageBilling,
} from '@/lib/billing/usage-metering';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  try {
    return apiSuccess(await getTenantUsageBilling((await params).tenantId));
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load tenant usage billing',
      error instanceof Error ? error.message : undefined,
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  const validation = validateBody(
    adminTenantUsageBillingSchema,
    await request.json().catch(() => null),
  );
  if (!validation.success) return validation.response;

  try {
    const tenantId = (await params).tenantId;
    const input = validation.data;
    const result =
      input.action === 'burnRate'
        ? await createTenantCreditBurnRate({
            actorUserId: auth.user.id,
            tenantId,
            billableUnit: input.billableUnit,
            creditMicrounits: input.creditMicrounits,
            quantityBasis: input.quantityBasis,
            validFrom: input.validFrom,
            rationale: input.rationale,
          })
        : await configureTenantUsageBilling({
            actorUserId: auth.user.id,
            tenantId,
            enabled: input.enabled,
            sellCurrency: input.sellCurrency,
            requiredUnits: input.requiredUnits,
          });
    return apiSuccess({ result }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Usage billing configuration failed';
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      /OVERLAP|COVERAGE|IMMUTABLE/i.test(message) ? 409 : 500,
      'Usage billing configuration rejected',
      message,
    );
  }
}

import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { adminTenantSellPriceSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import {
  createTenantSellPrice,
  getCurrentSellPrices,
  getTenantMargin,
  getTenantMarginBreakdown,
} from '@/lib/billing/value-pricing';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

function reportingPeriod(request: NextRequest): { from: string; to: string } | null {
  const to = request.nextUrl.searchParams.get('to') ?? new Date().toISOString();
  const from =
    request.nextUrl.searchParams.get('from') ??
    new Date(Date.parse(to) - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime >= toTime) return null;
  return { from, to };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  const period = reportingPeriod(request);
  if (!period) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid reporting period');

  try {
    const { tenantId } = await params;
    const [margin, breakdown, sellPrices] = await Promise.all([
      getTenantMargin(tenantId, period.from, period.to),
      getTenantMarginBreakdown(tenantId, period.from, period.to),
      getCurrentSellPrices(tenantId),
    ]);
    return apiSuccess({ period, margin, breakdown, sellPrices });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load tenant economics',
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }
  const validation = validateBody(adminTenantSellPriceSchema, body);
  if (!validation.success) return validation.response;

  try {
    const { tenantId } = await params;
    const version = await createTenantSellPrice({
      actorUserId: auth.user.id,
      tenantId,
      ...validation.data,
    });
    return apiSuccess({ version }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sell price creation failed';
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      /OVERLAP|IMMUTABLE/i.test(message) ? 409 : 500,
      'Sell price rejected',
      message,
    );
  }
}

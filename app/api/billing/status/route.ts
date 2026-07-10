// ---------------------------------------------------------------------------
// GET /api/billing/status?orgId=xxx
// Return current organization subscription status.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { getSubscriptionStatus } from '@/lib/billing/stripe';
import { getPlan } from '@/lib/billing/plans';
import { createLogger } from '@/lib/logger';

const log = createLogger('BillingStatus');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const subscription = await getSubscriptionStatus(orgId);

    if (!subscription) {
      const freePlan = getPlan('free');
      return NextResponse.json({
        plan: 'free',
        planName: freePlan.name,
        status: 'active',
        currentPeriodEnd: null,
      });
    }

    const plan = getPlan(subscription.plan);
    return NextResponse.json({
      plan: subscription.plan,
      planName: plan.name,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    log.error('Billing status error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

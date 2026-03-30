// ---------------------------------------------------------------------------
// POST /api/billing/checkout
// Create a Stripe Checkout session for subscription upgrade.
// Returns { url } to redirect the client.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { createCheckoutSession } from '@/lib/billing/stripe';
import { createLogger } from '@/lib/logger';

const log = createLogger('BillingCheckout');

const VALID_PLANS = new Set(['pro', 'enterprise']);
const VALID_INTERVALS = new Set(['month', 'year']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { orgId, plan, interval } = body as {
      orgId?: string;
      plan?: string;
      interval?: string;
    };

    if (!orgId || typeof orgId !== 'string') {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }
    if (!plan || !VALID_PLANS.has(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "pro" or "enterprise"' },
        { status: 400 },
      );
    }
    if (!interval || !VALID_INTERVALS.has(interval)) {
      return NextResponse.json(
        { error: 'Invalid interval. Must be "month" or "year"' },
        { status: 400 },
      );
    }

    const origin = request.nextUrl.origin;
    const result = await createCheckoutSession({
      orgId,
      plan: plan as 'pro' | 'enterprise',
      interval: interval as 'month' | 'year',
      successUrl: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pay?canceled=true`,
    });

    return NextResponse.json({ url: result.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    log.error('Checkout session creation failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

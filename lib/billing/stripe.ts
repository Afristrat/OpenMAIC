// ---------------------------------------------------------------------------
// Stripe Integration — International card payments for Qalem
// ---------------------------------------------------------------------------

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('Stripe');

// ---------------------------------------------------------------------------
// Stripe client (lazy singleton)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role)
// ---------------------------------------------------------------------------

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Price ID resolution
// ---------------------------------------------------------------------------

const PRICE_MAP: Record<string, string | undefined> = {
  'pro:month': process.env.STRIPE_PRICE_PRO_MONTHLY,
  'pro:year': process.env.STRIPE_PRICE_PRO_YEARLY,
  'enterprise:month': process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
};

function resolvePriceId(plan: 'pro' | 'enterprise', interval: 'month' | 'year'): string {
  const priceId = PRICE_MAP[`${plan}:${interval}`];
  if (!priceId) {
    throw new Error(`No Stripe price configured for ${plan}/${interval}`);
  }
  return priceId;
}

// ---------------------------------------------------------------------------
// Create Checkout Session
// ---------------------------------------------------------------------------

export async function createCheckoutSession(params: {
  orgId: string;
  plan: 'pro' | 'enterprise';
  interval: 'month' | 'year';
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();

  // Retrieve or create Stripe customer for this organization
  let customerId: string | undefined;

  if (supabase) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', params.orgId)
      .single();

    if (org?.stripe_customer_id) {
      customerId = org.stripe_customer_id;
    } else {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        metadata: { org_id: params.orgId },
        name: org?.name ?? undefined,
      });
      customerId = customer.id;

      // Persist customer ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
      await (supabase as any)
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', params.orgId);
    }
  }

  const priceId = resolvePriceId(params.plan, params.interval);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { org_id: params.orgId, plan: params.plan },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Handle Webhook Events
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(
  payload: string,
  signature: string,
): Promise<void> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');

  const event = stripe.webhooks.constructEvent(payload, signature, secret);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    log.warn('Supabase not configured — skipping webhook processing');
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orgId = session.metadata?.org_id;
      const plan = session.metadata?.plan;
      if (!orgId || !plan) break;

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      // Fetch subscription details for period end (v21: period is on items)
      let periodEnd: string | null = null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const firstItem = sub.items?.data?.[0];
        if (firstItem) {
          periodEnd = new Date(firstItem.current_period_end * 1000).toISOString();
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
      await (supabase as any)
        .from('organizations')
        .update({
          plan,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
          current_period_end: periodEnd,
        })
        .eq('id', orgId);

      log.info(`Organization ${orgId} upgraded to ${plan}`);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      // Stripe SDK v21: subscription ref is in parent.subscription_details
      const subRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subRef === 'string' ? subRef : subRef?.id;

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const orgId = sub.metadata?.org_id;
        const firstItem = sub.items?.data?.[0];
        if (orgId && firstItem) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
          await (supabase as any)
            .from('organizations')
            .update({
              subscription_status: 'active',
              current_period_end: new Date(firstItem.current_period_end * 1000).toISOString(),
            })
            .eq('id', orgId);
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const orgId = sub.metadata?.org_id;
      if (orgId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
        await (supabase as any)
          .from('organizations')
          .update({
            plan: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq('id', orgId);
        log.info(`Organization ${orgId} subscription canceled — reverted to free`);
      }
      break;
    }

    default:
      log.info(`Unhandled Stripe event type: ${event.type}`);
  }
}

// ---------------------------------------------------------------------------
// Get Subscription Status
// ---------------------------------------------------------------------------

export async function getSubscriptionStatus(orgId: string): Promise<{
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd: Date;
} | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('plan, subscription_status, current_period_end')
    .eq('id', orgId)
    .single();

  if (!org || org.plan === 'free') return null;

  return {
    plan: org.plan,
    status: org.subscription_status ?? 'active',
    currentPeriodEnd: org.current_period_end
      ? new Date(org.current_period_end)
      : new Date(),
  };
}

// ---------------------------------------------------------------------------
// Cancel Subscription
// ---------------------------------------------------------------------------

export async function cancelSubscription(orgId: string): Promise<void> {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase not configured');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', orgId)
    .single();

  if (!org?.stripe_subscription_id) {
    throw new Error('No active subscription found for this organization');
  }

  // Cancel at period end (graceful)
  await stripe.subscriptions.update(org.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client
  await (supabase as any)
    .from('organizations')
    .update({ subscription_status: 'canceled' })
    .eq('id', orgId);

  log.info(`Subscription for org ${orgId} scheduled for cancellation at period end`);
}

// ---------------------------------------------------------------------------
// Stripe Integration — International card payments for Qalem
// ---------------------------------------------------------------------------

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('Stripe');

function isLicensedPlan(plan: string | undefined): plan is 'pro' | 'enterprise' {
  return plan === 'pro' || plan === 'enterprise';
}

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
// Handle Webhook Events
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(payload: string, signature: string): Promise<void> {
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
      if (!orgId || !isLicensedPlan(plan)) {
        log.warn('Ignoring checkout completion without a licensed Qalem plan');
        break;
      }

      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

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
      const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id;

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
            plan: 'unlicensed',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq('id', orgId);
        log.info(`Organization ${orgId} subscription canceled; access is no longer licensed`);
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
  status: 'active' | 'past_due' | 'canceled';
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

  if (!org || org.plan === 'unlicensed' || org.plan === 'free') return null;

  const status =
    org.subscription_status === 'past_due' || org.subscription_status === 'canceled'
      ? org.subscription_status
      : 'active';

  return {
    plan: org.plan,
    status,
    currentPeriodEnd: org.current_period_end ? new Date(org.current_period_end) : new Date(),
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

// ---------------------------------------------------------------------------
// POST /api/billing/webhook
// Handle Stripe webhook events.
// Verifies signature, processes subscription lifecycle events.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/lib/billing/stripe';
import { createLogger } from '@/lib/logger';

const log = createLogger('BillingWebhook');

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    await handleStripeWebhook(payload, signature);

    return NextResponse.json({ received: true });
  } catch (error) {
    // La cause (signature, base, Stripe) reste dans le journal : le corps de la réponse est
    // lisible par quiconque sonde l'endpoint public.
    log.error('Stripe webhook error:', error instanceof Error ? error.message : String(error));
    // Return 400 so Stripe retries
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 400 });
  }
}

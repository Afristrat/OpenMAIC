// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// Receive IPN callbacks from payment providers.
// Verify signatures, update payment status in Supabase.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { handlePaymentWebhook } from '@/lib/payments';
import type { PaymentProvider } from '@/lib/payments';
import { createClient } from '@supabase/supabase-js';
import { statusesProtectedFrom } from '@/lib/payments/status-order';
import { verifyPaymentWebhookSignature } from '@/lib/payments/webhook-signature';
import { createLogger } from '@/lib/logger';

const log = createLogger('PaymentWebhook');

/**
 * Create a Supabase admin client (service role) for server-side writes.
 * Returns null when env vars are missing (e.g. during local dev without Supabase).
 */
function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const VALID_PROVIDERS = new Set<string>(['cinetpay', 'orange-money', 'wave', 'paypal']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Provider is passed as a query parameter: /api/payments/webhook?provider=cinetpay
    const provider = request.nextUrl.searchParams.get('provider') ?? '';

    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: 'Missing or invalid provider' }, { status: 400 });
    }

    // Octets exacts reçus : la signature porte sur le corps brut (request.text() retire un BOM).
    const rawBytes = new Uint8Array(await request.arrayBuffer());

    // --- Signature verification (HMAC du corps brut, refus par défaut) ---
    const signatureValid = verifyPaymentWebhookSignature(
      provider as PaymentProvider,
      request.headers,
      rawBytes,
    );
    if (!signatureValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const rawBody = new TextDecoder().decode(rawBytes);

    // Parse the body
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Some providers send form-encoded data
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    }

    // --- Process through provider adapter ---
    const result = await handlePaymentWebhook(provider as PaymentProvider, payload);

    // --- Update Supabase ---
    const supabase = getSupabaseAdmin();
    if (supabase && result.transactionId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client for payments table
      let update = (supabase as any)
        .from('payments')
        .update({
          status: result.status,
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', result.transactionId);
      // Statut monotone : un événement rejoué ou tardif ne régresse pas un paiement plus avancé.
      const protectedStatuses = statusesProtectedFrom(result.status);
      if (protectedStatuses.length > 0) {
        update = update.not('status', 'in', `(${protectedStatuses.join(',')})`);
      }
      const { error: updateError } = await update;

      if (updateError) {
        log.error('Supabase update error:', updateError.message);
      }
    }

    // Return 200 to acknowledge receipt (providers expect this)
    return NextResponse.json({ received: true, status: result.status });
  } catch (error) {
    log.error('Payment webhook processing failed:', error);
    // Still return 200 to avoid retries from most providers ; aucun détail interne au client.
    return NextResponse.json(
      { received: true, error: 'Webhook processing failed' },
      { status: 200 },
    );
  }
}

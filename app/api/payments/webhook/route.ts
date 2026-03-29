// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// Receive IPN callbacks from payment providers.
// Verify signatures, update payment status in Supabase.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { handlePaymentWebhook } from '@/lib/payments';
import type { PaymentProvider } from '@/lib/payments';
import { createClient } from '@supabase/supabase-js';

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

/**
 * TODO: Implement per-provider signature verification.
 * Each provider has its own way of signing webhooks:
 * - CinetPay: verify `cpm_site_id` matches + optional HMAC
 * - Orange Money: verify Authorization header / token
 * - Wave: verify `Wave-Signature` header with HMAC-SHA256
 */
function verifyWebhookSignature(
  _provider: PaymentProvider,
  _headers: Headers,
  _body: string,
): boolean {
  // Skeleton — always returns true. MUST be implemented before production.
  console.warn('[payments/webhook] Signature verification not yet implemented');
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Provider is passed as a query parameter: /api/payments/webhook?provider=cinetpay
    const provider = request.nextUrl.searchParams.get('provider') ?? '';

    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: 'Missing or invalid provider' }, { status: 400 });
    }

    const rawBody = await request.text();

    // --- Signature verification (skeleton) ---
    const signatureValid = verifyWebhookSignature(
      provider as PaymentProvider,
      request.headers,
      rawBody,
    );
    if (!signatureValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

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
    const { error: updateError } = await (supabase as any)
        .from('payments')
        .update({
          status: result.status,
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', result.transactionId);

      if (updateError) {
        console.error('[payments/webhook] Supabase update error:', updateError.message);
      }
    }

    // Return 200 to acknowledge receipt (providers expect this)
    return NextResponse.json({ received: true, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[payments/webhook]', message);
    // Still return 200 to avoid retries from most providers
    return NextResponse.json({ received: true, error: message }, { status: 200 });
  }
}

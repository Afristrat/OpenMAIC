// ---------------------------------------------------------------------------
// POST /api/payments/initiate
// Initiate a payment (provider, amount, currency).
// Returns redirect URL or payment instructions.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { initPayment } from '@/lib/payments';
import type { PaymentConfig, PaymentProvider, Currency } from '@/lib/payments';
import { validateBody } from '@/lib/api/validate';
import { paymentInitiateSchema } from '@/lib/api/schemas';

/**
 * Build a PaymentConfig from environment variables for the given provider.
 */
function buildConfig(provider: PaymentProvider): PaymentConfig {
  switch (provider) {
    case 'cinetpay':
      return {
        provider,
        apiKey: process.env.CINETPAY_API_KEY ?? '',
        siteId: process.env.CINETPAY_SITE_ID ?? '',
        sandbox: process.env.NODE_ENV !== 'production',
      };
    case 'orange-money':
      return {
        provider,
        apiKey: process.env.ORANGE_MONEY_API_KEY ?? '',
        merchantId: process.env.ORANGE_MONEY_MERCHANT_ID ?? '',
        sandbox: process.env.NODE_ENV !== 'production',
      };
    case 'wave':
      return {
        provider,
        apiKey: process.env.WAVE_API_KEY ?? '',
        sandbox: process.env.NODE_ENV !== 'production',
      };
    case 'paypal':
      return {
        provider,
        apiKey: '', // Not implemented yet
        sandbox: process.env.NODE_ENV !== 'production',
      };
    default:
      throw new Error(`Unsupported provider: ${provider as string}`);
  }
}

const VALID_PROVIDERS = new Set<string>(['cinetpay', 'orange-money', 'wave', 'paypal']);
const VALID_CURRENCIES = new Set<string>(['MAD', 'XOF', 'TND', 'DZD', 'USD', 'EUR']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.json();
    const validation = validateBody(paymentInitiateSchema, rawBody);
    if (!validation.success) return validation.response;
    const body = validation.data;

    const { provider, amount, currency } = body;
    const description = body.description ?? '';
    const customerEmail = body.customerEmail;
    const customerPhone = body.customerPhone;
    const metadata = body.metadata;

    const config = buildConfig(provider);

    const result = await initPayment(config, {
      amount,
      currency: currency as Currency,
      description,
      customerEmail,
      customerPhone,
      metadata,
    });

    return NextResponse.json({
      id: result.id,
      status: result.status,
      transactionId: result.transactionId,
      redirectUrl: result.redirectUrl ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[payments/initiate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Payment provider factory
// Routes to the correct adapter based on PaymentProvider type.
// ---------------------------------------------------------------------------

import type {
  PaymentConfig,
  PaymentProvider,
  PaymentProviderAdapter,
  PaymentRequest,
  PaymentResult,
} from './types';
import { cinetpayAdapter } from './providers/cinetpay';
import { orangeMoneyAdapter } from './providers/orange-money';
import { waveAdapter } from './providers/wave';

export type { PaymentConfig, PaymentProvider, PaymentRequest, PaymentResult } from './types';
export type { PaymentStatus, Currency, PaymentProviderAdapter } from './types';

const adapters: Record<PaymentProvider, PaymentProviderAdapter> = {
  cinetpay: cinetpayAdapter,
  'orange-money': orangeMoneyAdapter,
  wave: waveAdapter,
  // PayPal is listed as a provider type but has no adapter yet.
  // Adding a stub that throws so callers get a clear error.
  paypal: {
    async initPayment(): Promise<PaymentResult> {
      throw new Error('PayPal adapter not implemented yet');
    },
    async checkStatus(): Promise<PaymentResult> {
      throw new Error('PayPal adapter not implemented yet');
    },
    async handleWebhook(): Promise<PaymentResult> {
      throw new Error('PayPal adapter not implemented yet');
    },
  },
};

/**
 * Resolve the adapter for a given provider.
 */
export function getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Unknown payment provider: ${provider}`);
  }
  return adapter;
}

/**
 * Initiate a payment through the specified provider.
 */
export async function initPayment(
  config: PaymentConfig,
  request: PaymentRequest,
): Promise<PaymentResult> {
  return getAdapter(config.provider).initPayment(config, request);
}

/**
 * Check a payment's status through the specified provider.
 */
export async function checkPaymentStatus(
  config: PaymentConfig,
  transactionId: string,
): Promise<PaymentResult> {
  return getAdapter(config.provider).checkStatus(config, transactionId);
}

/**
 * Handle an incoming webhook from a payment provider.
 */
export async function handlePaymentWebhook(
  provider: PaymentProvider,
  payload: unknown,
): Promise<PaymentResult> {
  return getAdapter(provider).handleWebhook(payload);
}

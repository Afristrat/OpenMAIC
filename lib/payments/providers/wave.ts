// ---------------------------------------------------------------------------
// Wave — Mobile money for Senegal, Ivory Coast, and West Africa
// Skeleton implementation — actual API endpoints configured per deployment.
// Wave API docs: https://docs.wave.com/
// ---------------------------------------------------------------------------

import type {
  PaymentConfig,
  PaymentProviderAdapter,
  PaymentRequest,
  PaymentResult,
} from '../types';

/**
 * Placeholder URLs — replace with actual Wave endpoints.
 * Production: https://api.wave.com/v1/checkout/sessions
 */
const WAVE_CHECKOUT_URL = 'https://api.wave.com/v1/checkout/sessions';

function generateTransactionId(): string {
  return `WV_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const waveAdapter: PaymentProviderAdapter = {
  /**
   * Create a Wave checkout session.
   * Returns a redirect URL for the Wave payment page.
   * Requires `customerPhone` in the request.
   */
  async initPayment(config: PaymentConfig, request: PaymentRequest): Promise<PaymentResult> {
    if (!request.customerPhone) {
      throw new Error('Wave requires customerPhone');
    }

    const transactionId = generateTransactionId();

    const body = {
      amount: request.amount,
      currency: request.currency,
      client_reference: transactionId,
      // Wave uses the phone number to identify the payer
      customer_phone: request.customerPhone,
      customer_email: request.customerEmail ?? '',
      description: request.description,
      metadata: request.metadata ?? {},
    };

    const response = await fetch(WAVE_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Wave initPayment failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id?: string;
      checkout_status?: string;
      wave_launch_url?: string;
    };

    return {
      id: data.id ?? transactionId,
      provider: 'wave',
      status: 'pending',
      amount: request.amount,
      currency: request.currency,
      transactionId: data.id ?? transactionId,
      redirectUrl: data.wave_launch_url,
      createdAt: new Date(),
    };
  },

  /**
   * Check status of a Wave checkout session.
   */
  async checkStatus(config: PaymentConfig, transactionId: string): Promise<PaymentResult> {
    const response = await fetch(`${WAVE_CHECKOUT_URL}/${transactionId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Wave checkStatus failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      id?: string;
      checkout_status?: string;
      amount?: string;
      currency?: string;
      when_completed?: string;
    };

    const rawStatus = data.checkout_status ?? '';
    const status =
      rawStatus === 'complete'
        ? 'completed'
        : rawStatus === 'expired' || rawStatus === 'error'
          ? 'failed'
          : 'pending';

    return {
      id: data.id ?? transactionId,
      provider: 'wave',
      status,
      amount: Number(data.amount ?? 0),
      currency: (data.currency as PaymentResult['currency']) ?? 'XOF',
      transactionId: data.id ?? transactionId,
      createdAt: data.when_completed ? new Date(data.when_completed) : new Date(),
    };
  },

  /**
   * Traite un webhook Wave. Wave envoie un objet Événement `{ id, type, data }` (voir
   * https://docs.wave.com/webhook, « Event Types ») : la session de paiement est dans `data`.
   * Seuls les événements `checkout.session.*` sont rattachés à une transaction ; les échecs de
   * tentative (`checkout.session.payment_failed`) laissent la session en attente, Wave
   * documentant plusieurs échecs possibles avant un succès.
   */
  async handleWebhook(payload: unknown): Promise<PaymentResult> {
    const event = (payload ?? {}) as Record<string, unknown>;
    const session = event['data'];
    if (typeof session !== 'object' || session === null) {
      throw new Error('Wave webhook: objet `data` manquant');
    }
    const data = session as Record<string, unknown>;
    const isCheckoutEvent = String(event['type'] ?? '').startsWith('checkout.session.');
    const rawStatus = String(data['checkout_status'] ?? '');

    const status =
      rawStatus === 'complete'
        ? 'completed'
        : rawStatus === 'expired' || rawStatus === 'error'
          ? 'failed'
          : 'pending';

    return {
      id: String(data['id'] ?? ''),
      provider: 'wave',
      status,
      amount: Number(data['amount'] ?? 0),
      currency: String(data['currency'] ?? 'XOF') as PaymentResult['currency'],
      transactionId: isCheckoutEvent ? String(data['id'] ?? '') : '',
      createdAt: new Date(),
    };
  },
};

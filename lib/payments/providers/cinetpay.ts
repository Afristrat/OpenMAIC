// ---------------------------------------------------------------------------
// CinetPay — Main payment aggregator for francophone Africa
// API docs: https://docs.cinetpay.com/
// Endpoint: POST https://api-checkout.cinetpay.com/v2/payment
// ---------------------------------------------------------------------------

import type {
  PaymentConfig,
  PaymentProviderAdapter,
  PaymentRequest,
  PaymentResult,
} from '../types';

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

function generateTransactionId(): string {
  return `CP_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const cinetpayAdapter: PaymentProviderAdapter = {
  /**
   * Initiate a payment via CinetPay hosted checkout.
   * Returns a redirect URL the client must follow to complete payment.
   */
  async initPayment(config: PaymentConfig, request: PaymentRequest): Promise<PaymentResult> {
    const transactionId = generateTransactionId();

    const body = {
      apikey: config.apiKey,
      site_id: config.siteId,
      transaction_id: transactionId,
      amount: request.amount,
      currency: request.currency,
      description: request.description,
      customer_email: request.customerEmail ?? '',
      customer_phone_number: request.customerPhone ?? '',
      metadata: JSON.stringify(request.metadata ?? {}),
      // channels: 'ALL' — let CinetPay show all available methods
      channels: 'ALL',
    };

    const response = await fetch(CINETPAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`CinetPay initPayment failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      code: string;
      message: string;
      data?: { payment_url?: string };
    };

    if (data.code !== '201') {
      throw new Error(`CinetPay error ${data.code}: ${data.message}`);
    }

    return {
      id: transactionId,
      provider: 'cinetpay',
      status: 'pending',
      amount: request.amount,
      currency: request.currency,
      transactionId,
      redirectUrl: data.data?.payment_url,
      createdAt: new Date(),
    };
  },

  /**
   * Check payment status via CinetPay verification endpoint.
   */
  async checkStatus(config: PaymentConfig, transactionId: string): Promise<PaymentResult> {
    const body = {
      apikey: config.apiKey,
      site_id: config.siteId,
      transaction_id: transactionId,
    };

    const response = await fetch(CINETPAY_CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`CinetPay checkStatus failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      code: string;
      data?: {
        amount?: number;
        currency?: string;
        status?: string;
        payment_date?: string;
      };
    };

    const rawStatus = data.data?.status ?? '';
    const status =
      rawStatus === 'ACCEPTED'
        ? 'completed'
        : rawStatus === 'REFUSED' || rawStatus === 'ERROR'
          ? 'failed'
          : 'pending';

    return {
      id: transactionId,
      provider: 'cinetpay',
      status,
      amount: data.data?.amount ?? 0,
      currency: (data.data?.currency as PaymentResult['currency']) ?? 'XOF',
      transactionId,
      createdAt: data.data?.payment_date ? new Date(data.data.payment_date) : new Date(),
    };
  },

  /**
   * Process IPN (Instant Payment Notification) callback from CinetPay.
   * CinetPay sends a POST with `cpm_trans_id`, `cpm_site_id`, etc.
   */
  async handleWebhook(payload: unknown): Promise<PaymentResult> {
    const data = payload as Record<string, unknown>;
    const transactionId = String(data['cpm_trans_id'] ?? '');
    const rawStatus = String(data['cpm_result'] ?? '');

    const status =
      rawStatus === '00'
        ? 'completed'
        : rawStatus === 'REFUSED'
          ? 'failed'
          : 'pending';

    return {
      id: transactionId,
      provider: 'cinetpay',
      status,
      amount: Number(data['cpm_amount'] ?? 0),
      currency: (String(data['cpm_currency'] ?? 'XOF')) as PaymentResult['currency'],
      transactionId,
      createdAt: new Date(),
    };
  },
};

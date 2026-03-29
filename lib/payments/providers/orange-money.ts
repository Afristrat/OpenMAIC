// ---------------------------------------------------------------------------
// Orange Money — Mobile money for Morocco + West Africa
// Skeleton implementation — actual API endpoints are configured per deployment.
// Orange Money Web Payment API:
//   https://developer.orange.com/apis/om-webpay
// ---------------------------------------------------------------------------

import type {
  PaymentConfig,
  PaymentProviderAdapter,
  PaymentRequest,
  PaymentResult,
} from '../types';

/**
 * Placeholder URLs — replace with actual Orange Money endpoints per region.
 * Morocco: api.orange.com/orange-money-webpay/ma/v1
 * Senegal: api.orange.com/orange-money-webpay/sn/v1
 */
const OM_INIT_URL = 'https://api.orange.com/orange-money-webpay/v1/webpayment';
const OM_STATUS_URL = 'https://api.orange.com/orange-money-webpay/v1/transactionstatus';

function generateTransactionId(): string {
  return `OM_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const orangeMoneyAdapter: PaymentProviderAdapter = {
  /**
   * Initiate an Orange Money payment.
   * Requires `customerPhone` in the request.
   */
  async initPayment(config: PaymentConfig, request: PaymentRequest): Promise<PaymentResult> {
    if (!request.customerPhone) {
      throw new Error('Orange Money requires customerPhone');
    }

    const transactionId = generateTransactionId();

    const body = {
      merchant_key: config.merchantId,
      currency: request.currency,
      order_id: transactionId,
      amount: request.amount,
      // Orange Money uses MSISDN (phone number) to push the payment prompt
      customer_msisdn: request.customerPhone,
      description: request.description,
      metadata: request.metadata ?? {},
    };

    const response = await fetch(OM_INIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Orange Money initPayment failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      status?: number;
      payment_url?: string;
      pay_token?: string;
    };

    return {
      id: transactionId,
      provider: 'orange-money',
      status: 'pending',
      amount: request.amount,
      currency: request.currency,
      transactionId,
      redirectUrl: data.payment_url,
      createdAt: new Date(),
    };
  },

  /**
   * Check status of an Orange Money transaction.
   */
  async checkStatus(config: PaymentConfig, transactionId: string): Promise<PaymentResult> {
    const response = await fetch(OM_STATUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        order_id: transactionId,
        merchant_key: config.merchantId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Orange Money checkStatus failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      status?: string;
      amount?: number;
      currency?: string;
      created_at?: string;
    };

    const rawStatus = data.status ?? '';
    const status =
      rawStatus === 'SUCCESS'
        ? 'completed'
        : rawStatus === 'FAILED'
          ? 'failed'
          : 'pending';

    return {
      id: transactionId,
      provider: 'orange-money',
      status,
      amount: data.amount ?? 0,
      currency: (data.currency as PaymentResult['currency']) ?? 'MAD',
      transactionId,
      createdAt: data.created_at ? new Date(data.created_at) : new Date(),
    };
  },

  /**
   * Process webhook callback from Orange Money.
   */
  async handleWebhook(payload: unknown): Promise<PaymentResult> {
    const data = payload as Record<string, unknown>;
    const rawStatus = String(data['status'] ?? '');

    const status =
      rawStatus === 'SUCCESS'
        ? 'completed'
        : rawStatus === 'FAILED'
          ? 'failed'
          : 'pending';

    return {
      id: String(data['order_id'] ?? ''),
      provider: 'orange-money',
      status,
      amount: Number(data['amount'] ?? 0),
      currency: (String(data['currency'] ?? 'MAD')) as PaymentResult['currency'],
      transactionId: String(data['order_id'] ?? ''),
      createdAt: new Date(),
    };
  },
};

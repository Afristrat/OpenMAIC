// ---------------------------------------------------------------------------
// Payment types for North Africa mobile money & local aggregators
// Providers: CinetPay, Orange Money, Wave, PayPal
// ---------------------------------------------------------------------------

export type PaymentProvider = 'cinetpay' | 'orange-money' | 'wave' | 'paypal';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/** ISO 4217 currencies relevant to North & West Africa + international */
export type Currency = 'MAD' | 'XOF' | 'TND' | 'DZD' | 'USD' | 'EUR';

export interface PaymentConfig {
  provider: PaymentProvider;
  apiKey: string;
  /** CinetPay site identifier */
  siteId?: string;
  /** Merchant identifier (Orange Money, Wave) */
  merchantId?: string;
  /** When true, requests hit the provider sandbox environment */
  sandbox: boolean;
}

export interface PaymentRequest {
  amount: number;
  currency: Currency;
  description: string;
  customerEmail?: string;
  /** Required for Orange Money / Wave */
  customerPhone?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  transactionId: string;
  /** Redirect URL for hosted payment pages */
  redirectUrl?: string;
  createdAt: Date;
}

/**
 * Contract every payment provider adapter must implement.
 */
export interface PaymentProviderAdapter {
  initPayment(config: PaymentConfig, request: PaymentRequest): Promise<PaymentResult>;
  checkStatus(config: PaymentConfig, transactionId: string): Promise<PaymentResult>;
  handleWebhook(payload: unknown): Promise<PaymentResult>;
}

import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, verifyPaymentWebhookSignature } from '@/lib/payments/webhook-signature';

const BODY = '{"id":"cos-1","checkout_status":"complete"}';
const env = { WAVE_WEBHOOK_SECRET: 'whsec_test' };

function headers(signature?: string): Headers {
  return new Headers(signature ? { 'Wave-Signature': signature } : {});
}

describe('verifyPaymentWebhookSignature', () => {
  it('accepte une signature Wave valide (brute ou préfixée)', () => {
    const sig = hmacSha256Hex('whsec_test', BODY);
    expect(verifyPaymentWebhookSignature('wave', headers(sig), BODY, env)).toBe(true);
    expect(verifyPaymentWebhookSignature('wave', headers(`sha256=${sig}`), BODY, env)).toBe(true);
  });

  it('refuse un corps altéré, une signature absente ou mal formée', () => {
    const sig = hmacSha256Hex('whsec_test', BODY);
    expect(verifyPaymentWebhookSignature('wave', headers(sig), BODY + ' ', env)).toBe(false);
    expect(verifyPaymentWebhookSignature('wave', headers(), BODY, env)).toBe(false);
    expect(verifyPaymentWebhookSignature('wave', headers('zz'), BODY, env)).toBe(false);
  });

  it("refuse quand le secret n'est pas configuré", () => {
    const sig = hmacSha256Hex('whsec_test', BODY);
    expect(verifyPaymentWebhookSignature('wave', headers(sig), BODY, {})).toBe(false);
  });

  it('refuse par défaut les fournisseurs sans format documenté', () => {
    const sig = hmacSha256Hex('whsec_test', BODY);
    for (const provider of ['cinetpay', 'orange-money', 'paypal'] as const) {
      expect(verifyPaymentWebhookSignature(provider, headers(sig), BODY, env)).toBe(false);
    }
  });
});

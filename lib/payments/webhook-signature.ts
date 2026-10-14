import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from './types';

/**
 * Vérification de signature des webhooks de paiement (refus par défaut).
 *
 * - Wave : HMAC-SHA256 hexadécimal du corps BRUT, en-tête `Wave-Signature`
 *   (préfixes `sha256=` ou `v1=` tolérés), secret `WAVE_WEBHOOK_SECRET`.
 * - CinetPay, Orange Money, PayPal : le format de signature n'est documenté nulle part dans
 *   le dépôt et n'est pas inventé ici ; ces fournisseurs sont refusés tant qu'une
 *   vérification dédiée n'est pas ajoutée.
 */

const HMAC_PROVIDERS: Partial<Record<PaymentProvider, { header: string; secretEnv: string }>> = {
  wave: { header: 'wave-signature', secretEnv: 'WAVE_WEBHOOK_SECRET' },
};

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function verifyPaymentWebhookSignature(
  provider: PaymentProvider,
  headers: Headers,
  rawBody: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const scheme = HMAC_PROVIDERS[provider];
  if (!scheme) return false;

  const secret = env[scheme.secretEnv];
  const header = headers.get(scheme.header);
  if (!secret || !header) return false;

  const provided = header
    .trim()
    .replace(/^(sha256|v1)=/i, '')
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const expected = hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

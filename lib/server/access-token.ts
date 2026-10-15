import { createHmac, timingSafeEqual } from 'crypto';

/** Durée de vie d'un jeton d'accès, alignée sur le `maxAge` du cookie `openmaic_access`. */
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Tolérance d'horloge accordée à un jeton daté légèrement dans le futur. */
const CLOCK_SKEW_MS = 60_000;

/** Create an HMAC-signed token: `timestamp.signature` */
export function createAccessToken(accessCode: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

/** Verify an HMAC-signed token against the access code */
export function verifyAccessToken(token: string, accessCode: string): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  // Le jeton porte sa date de création : sans contrôle, un jeton volé vaudrait indéfiniment.
  if (!/^\d{1,15}$/.test(timestamp)) return false;
  const age = Date.now() - Number(timestamp);
  if (age < -CLOCK_SKEW_MS || age > ACCESS_TOKEN_MAX_AGE_SECONDS * 1000) return false;

  const expected = createHmac('sha256', accessCode).update(timestamp).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}

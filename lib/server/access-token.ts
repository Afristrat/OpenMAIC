import { createHmac, scryptSync, timingSafeEqual } from 'crypto';

/** Durée de vie d'un jeton d'accès, alignée sur le `maxAge` du cookie `openmaic_access`. */
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Tolérance d'horloge accordée à un jeton daté légèrement dans le futur. */
const CLOCK_SKEW_MS = 60_000;

const KEY_DOMAIN = 'qalem:access-token:v2';

let cachedKey: { code: string; pepper: string; key: Buffer } | undefined;

/**
 * Clé de signature des jetons, distincte du code d'accès : un cookie valide (horodatage + signature
 * connus de son porteur) ne doit pas permettre de tester des codes hors ligne en un simple HMAC.
 *
 * - `ACCESS_TOKEN_SECRET` défini (recommandé) : il entre dans la dérivation, le code seul ne suffit
 *   plus à recalculer la clé, donc aucune force brute hors ligne depuis un cookie ;
 * - sinon : dérivation scrypt (coût mémoire/CPU par essai) ; le code reste attaquable hors ligne
 *   mais à un coût sans commune mesure avec un HMAC. Mémoïsée (une dérivation par processus).
 *
 * Les jetons émis avec l'ancienne dérivation (HMAC direct du code) sont refusés : les sessions
 * existantes se réinitialisent une fois.
 */
function signingKey(accessCode: string): Buffer {
  const pepper = process.env.ACCESS_TOKEN_SECRET?.trim() ?? '';
  if (cachedKey && cachedKey.code === accessCode && cachedKey.pepper === pepper) {
    return cachedKey.key;
  }
  const key = pepper
    ? createHmac('sha256', pepper).update(`${KEY_DOMAIN}\0${accessCode}`).digest()
    : scryptSync(accessCode, KEY_DOMAIN, 32, { N: 2 ** 14, r: 8, p: 1 });
  cachedKey = { code: accessCode, pepper, key };
  return key;
}

function sign(timestamp: string, accessCode: string): string {
  return createHmac('sha256', signingKey(accessCode)).update(timestamp).digest('hex');
}

/** Create an HMAC-signed token: `timestamp.signature` */
export function createAccessToken(accessCode: string): string {
  const timestamp = Date.now().toString();
  return `${timestamp}.${sign(timestamp, accessCode)}`;
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

  const expected = sign(timestamp, accessCode);

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}

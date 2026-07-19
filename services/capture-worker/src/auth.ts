import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Fails closed: an unconfigured CAPTURE_WORKER_TOKEN rejects every request
 * rather than accepting all of them.
 */
export function isAuthorized(authorizationHeader: string | undefined): boolean {
  const expectedToken = process.env.CAPTURE_WORKER_TOKEN;
  if (!expectedToken) return false;
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false;

  const providedToken = authorizationHeader.slice(BEARER_PREFIX.length);
  return safeCompare(providedToken, expectedToken);
}

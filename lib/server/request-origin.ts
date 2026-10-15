import type { NextRequest } from 'next/server';

const FORWARDED_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

/**
 * X-Forwarded-Host / X-Forwarded-Proto sont des en-têtes que n'importe quel client peut envoyer :
 * ils ne sont crus que si l'exploitant déclare explicitement que le proxy en amont les réécrit
 * (TRUST_PROXY_HEADERS=true).
 */
function trustProxyHeaders(): boolean {
  const flag = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Origine publique de l'application, utilisée pour construire des liens persistés ou renvoyés
 * (URL de classe, logo, sondage de job). Ordre :
 *  1. NEXT_PUBLIC_APP_URL (configuration de l'exploitant, seule source fiable) ;
 *  2. en-têtes X-Forwarded-* uniquement si TRUST_PROXY_HEADERS=true et valeur bien formée ;
 *  3. sinon l'origine vue par Next.js (en-tête Host, contraint par le routage du proxy).
 */
export function buildRequestOrigin(req: NextRequest): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Ignore malformed optional configuration and derive the request origin.
    }
  }

  if (!trustProxyHeaders()) return req.nextUrl.origin;

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!forwardedHost || !FORWARDED_HOST_PATTERN.test(forwardedHost)) return req.nextUrl.origin;

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const localHost =
    /^(?:localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/i.test(
      forwardedHost,
    );
  const protocol = localHost && forwardedProto !== 'https' ? 'http' : 'https';
  return `${protocol}://${forwardedHost}`;
}

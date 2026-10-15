import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/server/access-token';

/**
 * Garde serveur de ACCESS_CODE (mot de passe de site pour les déploiements partagés).
 *
 * Historique : en amont (OpenMAIC), `middleware.ts` appliquait ce code côté serveur ; il a été
 * supprimé dans le fork (collision avec proxy.ts) et seul le garde React `AccessCodeGuard`
 * (modale côté client) est resté, contournable en appelant l'API directement. Cette garde
 * rétablit l'application côté serveur sur `/api/*`. Sans ACCESS_CODE, elle ne fait rien.
 */

export const ACCESS_COOKIE_NAME = 'openmaic_access';

/**
 * Routes qui doivent rester joignables sans le cookie : la saisie du code elle-même, la sonde et
 * les métriques, et les appels serveur à serveur de tiers qui ne portent jamais ce cookie
 * (webhooks signés, LTI : la plateforme LMS lit le JWKS/la config et POSTe launch/login,
 * MCP : clé Bearer propre), ainsi que les points publics par conception : clé publique de
 * vérification des licences locales, statut de licence (appelé par l'application locale,
 * identifiants opaques licence + appareil, réponse signée) et vérification d'un certificat par
 * QR code.
 * `/api/invitations/signup` reste volontairement GATÉ (décision à confirmer par Amine).
 */
const EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/api/access-code/verify',
  '/api/access-code/status',
  '/api/health',
  '/api/metrics',
  '/api/billing/webhook',
  '/api/payments/webhook',
  '/api/lti/launch',
  '/api/lti/login',
  '/api/lti/jwks',
  '/api/lti/config',
  '/api/mcp',
  '/api/local/public-key',
  '/api/certificates/verify',
]);

/** Exemptions de préfixe, toujours avec le séparateur de segment (jamais `/api/x` pour `/api/xy`). */
const EXEMPT_PREFIXES: readonly string[] = ['/api/local/licenses/', '/api/certificates/verify/'];

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Vrai si ACCESS_CODE est configuré et que la requête n'y satisfait pas. */
export function isAccessCodeRequired(req: NextRequest): boolean {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) return false;
  const pathname = normalizePath(req.nextUrl.pathname);
  if (EXEMPT_PATHS.has(pathname) || EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }

  const token = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  return !(token && verifyAccessToken(token, accessCode));
}

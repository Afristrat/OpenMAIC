import type { NextRequest } from 'next/server';
import { buildRequestOrigin } from '@/lib/server/request-origin';

/**
 * Défense en profondeur contre le CSRF des routes `/api/*` authentifiées par cookie.
 *
 * Les cookies Supabase sont `SameSite=Lax` (node_modules/@supabase/ssr, constants), ce qui bloque
 * déjà un POST inter-sites, mais pas un POST venant d'un site frère (sous-domaine de la même
 * « site » eTLD+1) ni un navigateur qui ignorerait SameSite. Un navigateur envoie toujours
 * `Origin` sur une requête non sûre : s'il est présent et n'est pas l'origine de l'application,
 * la requête est refusée.
 *
 * Passent sans contrôle : les méthodes sûres, les appels sans `Origin` (clients non navigateur :
 * curl, serveur à serveur, webhooks signés), et les routes de {@link CSRF_EXEMPT_PATHS}.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Routes qui reçoivent légitimement des POST inter-sites d'un navigateur ou d'un tiers, et qui
 * s'authentifient sans cookie de session Qalem :
 * - webhooks de paiement/facturation : signature du fournisseur ;
 * - LTI login/launch : formulaire POSTé par la plateforme LMS, état vérifié par cookie dédié + JWT ;
 * - MCP : clé Bearer, jamais le cookie.
 * `/api/v1/*` n'en fait volontairement pas partie : ces alias passent par `requireAuth`
 * (cookie de session), ils doivent donc être protégés.
 */
export const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/api/billing/webhook',
  '/api/payments/webhook',
  '/api/lti/launch',
  '/api/lti/login',
  '/api/mcp',
]);

/**
 * Préfixes de routes réservées à un client non navigateur Qalem, qui s'authentifie par jeton
 * Bearer et jamais par cookie : l'extension de capture envoie un `Origin` `chrome-extension://…`
 * ou `moz-extension://…` qui n'est pas celui de l'application. Sans cookie de session, il n'y a
 * rien à forger côté CSRF. Le préfixe se termine par `/` pour ne pas couvrir un chemin voisin.
 */
export const CSRF_EXEMPT_PREFIXES: readonly string[] = ['/api/capture/ingest/'];

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Vrai si `origin` désigne l'application : l'origine publique attendue
 * (NEXT_PUBLIC_APP_URL, sinon en-têtes de proxy de confiance, sinon origine vue par Next.js),
 * ou l'hôte exact de l'en-tête `Host`. Le navigateur fixe `Host` lui-même : un site tiers ne peut
 * pas le forger vers l'hôte de l'application, ce qui évite de bloquer à tort derrière un proxy
 * qui conserve `Host` quand NEXT_PUBLIC_APP_URL n'est pas renseigné.
 */
function isOwnOrigin(req: NextRequest, origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin === 'null' || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return false;
  }
  if (parsed.origin === buildRequestOrigin(req)) return true;

  const host = req.headers.get('host')?.trim().toLowerCase();
  return host !== undefined && host !== '' && parsed.host === host;
}

/** Vrai si la requête est une requête non sûre portant un `Origin` étranger à l'application. */
export function isCrossOriginUnsafeRequest(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const pathname = normalizePath(req.nextUrl.pathname);
  if (CSRF_EXEMPT_PATHS.has(pathname)) return false;
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;

  const origin = req.headers.get('origin');
  if (origin === null) return false;
  return !isOwnOrigin(req, origin);
}

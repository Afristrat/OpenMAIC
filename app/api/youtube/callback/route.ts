/**
 * GET /api/youtube/callback — retour de Google après le consentement : vérifie l'état signé,
 * échange le code, lit la chaîne, range le jeton de rafraîchissement chiffré, puis renvoie la
 * personne sur « Mes exports » avec le résultat dans l'adresse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';
import { buildRequestOrigin } from '@/lib/server/request-origin';
import {
  exchangeAuthorizationCode,
  fetchOwnChannel,
  readOAuthState,
  saveYoutubeConnection,
  YOUTUBE_SCOPES,
} from '@/lib/server/youtube';

export const dynamic = 'force-dynamic';
const log = createLogger('YoutubeCallbackAPI');

function backToExports(origin: string, result: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `${origin}/exports?youtube=${result}`,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = buildRequestOrigin(request);
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  // L'écran de consentement refusé par la personne revient avec `error=access_denied`.
  if (params.get('error')) return backToExports(origin, 'denied');
  if (!code || !state || !readOAuthState(state, auth.user.id)) {
    return backToExports(origin, 'invalid');
  }

  try {
    const token = await exchangeAuthorizationCode(code, origin);
    const granted = token.scope.split(' ');
    // Sans le droit d'envoi, la connexion ne servirait à rien : on le dit plutôt que de la ranger.
    if (!YOUTUBE_SCOPES.every((scope) => granted.includes(scope))) {
      return backToExports(origin, 'scope');
    }
    if (!token.refreshToken) return backToExports(origin, 'invalid');
    const channel = await fetchOwnChannel(token.accessToken);
    // Un compte Google sans chaîne YouTube ne peut rien publier.
    if (!channel) return backToExports(origin, 'nochannel');
    await saveYoutubeConnection({
      userId: auth.user.id,
      channelId: channel.id,
      channelTitle: channel.title,
      scope: token.scope,
      refreshToken: token.refreshToken,
    });
    return backToExports(origin, 'connected');
  } catch (error) {
    log.error('YouTube connection failed:', error);
    return backToExports(origin, 'error');
  }
}

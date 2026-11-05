/**
 * GET /api/youtube/connect — démarre la connexion de la chaîne YouTube de la personne connectée :
 * redirige vers l'écran de consentement Google (accès hors ligne, état signé lié à la personne).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/request-origin';
import { buildAuthorizationUrl, createOAuthState, youtubeOAuthConfig } from '@/lib/server/youtube';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  if (!youtubeOAuthConfig()) {
    return apiError('PROVIDER_DISABLED', 503, "La publication YouTube n'est pas configurée");
  }
  const url = buildAuthorizationUrl(buildRequestOrigin(request), createOAuthState(auth.user.id));
  return new NextResponse(null, {
    status: 307,
    headers: { Location: url, 'Cache-Control': 'private, no-store' },
  });
}

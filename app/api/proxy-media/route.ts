/**
 * Media Proxy API
 *
 * Server-side proxy for fetching remote media URLs (images/videos).
 * Required because browser fetch() to remote CDN URLs fails with CORS errors.
 * The media orchestrator uses this to download generated media as blobs
 * for IndexedDB persistence.
 *
 * POST /api/proxy-media
 * Body: { url: string } (Content-Type: application/json), utilisateur connecté requis
 * Response: Binary blob with a whitelisted Content-Type, served in a CSP sandbox
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SafeFetchRedirectError,
  SsrfBlockedError,
  safeFetch,
  type SafeFetchResult,
} from '@/lib/server/ssrf-guard';
import { requireAuth } from '@/lib/api/auth';
import { apiError, publicErrorMessage } from '@/lib/server/api-response';
import { resolveProxyContentType } from '@/lib/server/proxy-media-content-type';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyMedia');

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let url: string | undefined;
  try {
    const auth = await requireAuth(request);
    if (auth.response) return auth.response;

    // Un corps JSON exige un en-tête explicite : une requête inter-sites en formulaire est refusée.
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return apiError('INVALID_REQUEST', 415, 'Content-Type must be application/json');
    }

    ({ url } = await request.json());

    if (!url || typeof url !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing or invalid url');
    }

    // Chaque saut est validé, résolu une seule fois et la connexion est épinglée sur l'adresse
    // validée (anti DNS rebinding, anti redirection vers le réseau interne).
    let fetched: SafeFetchResult;
    try {
      fetched = await safeFetch(url);
    } catch (error) {
      if (error instanceof SsrfBlockedError) return apiError('INVALID_URL', 403, error.message);
      if (error instanceof SafeFetchRedirectError) {
        return error.code === 'TOO_MANY_REDIRECTS'
          ? apiError('TOO_MANY_REDIRECTS', 502, error.message)
          : apiError('UPSTREAM_ERROR', 502, error.message);
      }
      throw error;
    }
    const { response, finalUrl: currentUrl, dispose } = fetched;
    try {
      return await relayUpstream(response, currentUrl);
    } finally {
      await dispose();
    }
  } catch (error) {
    log.error(`Proxy media failed [url="${url?.substring(0, 100) ?? 'unknown'}"]:`, error);
    return apiError('INTERNAL_ERROR', 500, publicErrorMessage(error));
  }
}

async function relayUpstream(response: SafeFetchResult['response'], currentUrl: string) {
  if (!response.ok) {
    // Forward client (4xx) errors as-is so the caller treats them as permanent
    // (no retry); collapse upstream server (5xx) errors to 502.
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    return apiError('UPSTREAM_ERROR', status, `Upstream returned ${response.status}`);
  }

  const MAX_PROXY_BYTES = 25 * 1024 * 1024; // 25 MiB
  const contentLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BYTES) {
    return apiError('UPSTREAM_ERROR', 502, `Upstream asset too large (${contentLength} bytes)`);
  }
  // Seuls les types de la liste blanche sont relayés (jamais text/html : XSS réfléchi).
  const contentType = resolveProxyContentType(response.headers.get('content-type'), currentUrl);
  if (!contentType) {
    return apiError('INVALID_REQUEST', 415, 'Unsupported upstream content type');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_PROXY_BYTES) {
    return apiError('UPSTREAM_ERROR', 502, `Upstream asset too large (${bytes.byteLength} bytes)`);
  }

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
      // Neutralise tout script embarqué (SVG) si la réponse est ouverte directement.
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

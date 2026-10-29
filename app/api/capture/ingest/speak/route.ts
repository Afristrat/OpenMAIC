/**
 * Voix off de l'extension de capture : synthèse d'un texte, débitée du solde de l'organisation de
 * l'auteur à la seconde d'audio produite.
 *
 * Le fournisseur, le modèle, la voix et la clé sont ceux de la plateforme : l'extension envoie
 * seulement le texte (borné) et, au plus, une langue. Aucun texte dans les journaux.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveSpeechLanguage } from '@/lib/audio/tts-utils';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { resolveBillingOrganization } from '@/lib/capture/billing-organization';
import { consumeMediaQuota } from '@/lib/capture/describe-limit';
import { MAX_SPEAK_BODY_BYTES, speakSchema } from '@/lib/capture/media';
import { pickCaptureSpeechProvider } from '@/lib/capture/speech-provider';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { createLogger } from '@/lib/logger';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import { readLimitedBody, ResponseTooLargeError } from '@/lib/server/read-limited-body';

const log = createLogger('CaptureSpeakAPI');

export const maxDuration = 60;

const SPEECH_TIMEOUT_MS = 50_000;

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS) });

export async function POST(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  if (!consumeMediaQuota(auth.tokenId)) {
    const limited = apiError(
      API_ERROR_CODES.RATE_LIMITED,
      429,
      'Trop de demandes, réessayez dans une minute',
    );
    limited.headers.set('Retry-After', '60');
    return limited;
  }

  let raw: string;
  try {
    const limited = await readLimitedBody(request.body, MAX_SPEAK_BODY_BYTES);
    raw = new TextDecoder().decode(limited.bytes);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Demande trop volumineuse');
    }
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Demande illisible');
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // corps non JSON : refusé ci-dessous par le schéma
  }
  const parsed = speakSchema.safeParse(body);
  if (!parsed.success) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Demande invalide');
  const { text, language } = parsed.data;

  try {
    const orgId = await resolveBillingOrganization(auth.ownerId);
    if (!orgId) {
      return apiError(
        API_ERROR_CODES.NO_ORGANIZATION,
        403,
        "Aucune organisation active n'est associée à ce compte",
      );
    }
    const provider = pickCaptureSpeechProvider();
    if (!provider) {
      return apiError(
        API_ERROR_CODES.PROVIDER_DISABLED,
        503,
        "La voix off n'est pas disponible pour le moment",
      );
    }

    // Clé d'idempotence toujours tirée par le serveur : jamais rejouable par le client.
    const headers = new Headers({ 'idempotency-key': randomUUID() });
    const result = await runWithUsageMeteringContext(headers, auth.ownerId, orgId, () =>
      generateTTS(
        {
          providerId: provider.providerId,
          modelId: provider.modelId,
          apiKey: resolveTTSApiKey(provider.providerId),
          baseUrl: resolveTTSBaseUrl(provider.providerId),
          voice: provider.voice,
          language: resolveSpeechLanguage(language),
          fetch: fetchWithTimeout,
        },
        text,
      ),
    );
    const format = result.format || 'mp3';
    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        'Content-Type': format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const credits = creditsErrorResponse(error);
    if (credits) return credits;
    log.error('Capture speech failed', error instanceof Error ? error.name : 'unknown');
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 502, 'La voix off a échoué');
  }
}

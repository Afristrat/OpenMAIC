/**
 * Narration de l'extension de capture : transcription horodatée d'un lot de voix, débitée du solde
 * de l'organisation de l'auteur à la seconde d'audio.
 *
 * Le fournisseur, le modèle et la clé sont ceux de la plateforme : l'extension n'en envoie aucun.
 * Corps = un fichier WAV, lu en flux avec plafond ; la durée est mesurée et plafonnée avant toute
 * réservation. Aucun contenu audio ni texte transcrit dans les journaux.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { transcribeVerbose } from '@/lib/audio/asr-verbose';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { resolveBillingOrganization } from '@/lib/capture/billing-organization';
import { consumeMediaQuota } from '@/lib/capture/describe-limit';
import {
  MAX_TRANSCRIBE_BYTES,
  MAX_TRANSCRIBE_SECONDS,
  TRANSCRIBE_MODEL_ID,
  transcribeLanguage,
  wavDurationSeconds,
} from '@/lib/capture/media';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { createLogger } from '@/lib/logger';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import {
  isServerConfiguredProvider,
  resolveASRApiKey,
  resolveASRBaseUrl,
  resolveASRModel,
} from '@/lib/server/provider-config';
import { readLimitedBody, ResponseTooLargeError } from '@/lib/server/read-limited-body';

const log = createLogger('CaptureTranscribeAPI');

export const maxDuration = 60;

const ASR_PROVIDER_ID = 'openai-whisper';

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

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_TRANSCRIBE_BYTES) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Enregistrement trop volumineux');
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = (await readLimitedBody(request.body, MAX_TRANSCRIBE_BYTES)).bytes;
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Enregistrement trop volumineux');
    }
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Enregistrement illisible');
  }
  // Durée mesurée sur le contenu reçu, jamais lue dans un débit déclaré : c'est elle qu'on plafonne et qu'on débite.
  const seconds = wavDurationSeconds(bytes);
  if (seconds === null) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Un fichier WAV (PCM 16 bits) est attendu',
    );
  }
  if (seconds > MAX_TRANSCRIBE_SECONDS) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Enregistrement trop long');
  }

  try {
    const orgId = await resolveBillingOrganization(auth.ownerId);
    if (!orgId) {
      return apiError(
        API_ERROR_CODES.NO_ORGANIZATION,
        403,
        "Aucune organisation active n'est associée à ce compte",
      );
    }
    if (!isServerConfiguredProvider('asr', ASR_PROVIDER_ID)) {
      return apiError(
        API_ERROR_CODES.PROVIDER_DISABLED,
        503,
        "La transcription n'est pas disponible pour le moment",
      );
    }

    const language = transcribeLanguage(new URL(request.url).searchParams.get('language'));
    // Clé d'idempotence toujours tirée par le serveur : jamais rejouable par le client.
    const headers = new Headers({ 'idempotency-key': randomUUID() });
    const transcript = await runWithUsageMeteringContext(headers, auth.ownerId, orgId, () =>
      transcribeVerbose(
        {
          providerId: ASR_PROVIDER_ID,
          // Le modèle est celui que la plateforme épingle pour ce fournisseur ; Whisper à défaut.
          modelId: resolveASRModel(ASR_PROVIDER_ID, TRANSCRIBE_MODEL_ID),
          apiKey: resolveASRApiKey(ASR_PROVIDER_ID),
          baseUrl: resolveASRBaseUrl(ASR_PROVIDER_ID),
          ...(language ? { language } : {}),
        },
        new Blob([bytes], { type: 'audio/wav' }),
        seconds,
      ),
    );
    const response = apiSuccess(transcript);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const credits = creditsErrorResponse(error);
    if (credits) return credits;
    log.error('Capture transcription failed', error instanceof Error ? error.name : 'unknown');
    return apiError(API_ERROR_CODES.TRANSCRIPTION_FAILED, 502, 'La transcription a échoué');
  }
}

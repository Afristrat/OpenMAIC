/**
 * Réglages de l'extension de capture après connexion : mode choisi, narration, langue, et état du
 * compte (modèle reconnu, organisation débitée, solde). Jeton Bearer.
 */

import { NextRequest } from 'next/server';
import { microunitsToCredits } from '@/lib/billing/credits';
import { fetchCreditStatus } from '@/lib/billing/credit-preflight';
import { resolveBillingOrganization } from '@/lib/capture/billing-organization';
import { readCapturePreferences } from '@/lib/capture/preferences';
import { pickCaptureSpeechProvider } from '@/lib/capture/speech-provider';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { isServerConfiguredProvider } from '@/lib/server/provider-config';

const log = createLogger('CaptureOptionsAPI');

export async function GET(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  try {
    const [preferences, orgId] = await Promise.all([
      readCapturePreferences(auth.ownerId),
      resolveBillingOrganization(auth.ownerId),
    ]);
    const status = orgId ? await fetchCreditStatus(orgId).catch(() => null) : null;
    const response = apiSuccess({
      captureMode: preferences.captureMode,
      narration: preferences.narration,
      writingLanguage: preferences.writingLanguage,
      // Le nom du modèle n'est jamais renvoyé : l'extension sait seulement s'il est reconnu.
      modelReady: preferences.accountModel !== null,
      // Fournisseurs gérés par la plateforme : jamais leur nom, seulement s'ils répondent.
      narrationAvailable: isServerConfiguredProvider('asr', 'openai-whisper'),
      voiceoverAvailable: pickCaptureSpeechProvider() !== null,
      hasOrganization: orgId !== null,
      balanceCredits: status ? microunitsToCredits(status.balanceMicrounits) : null,
      blocked: status?.blocked ?? null,
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    log.error('Failed to read capture options', error instanceof Error ? error.message : error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de la lecture des réglages');
  }
}

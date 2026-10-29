/**
 * Enregistre les choix de l'extension de capture : mode (titres simples ou descriptions IA),
 * narration, langue de rédaction. Jeton Bearer. Aucun modèle n'est accepté (champ inconnu refusé).
 */

import { NextRequest } from 'next/server';
import { preferencesPatchSchema, saveCapturePreferences } from '@/lib/capture/preferences';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

const log = createLogger('CapturePreferencesAPI');

export async function PUT(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  const parsed = preferencesPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Préférences invalides');
  }
  try {
    await saveCapturePreferences(auth.ownerId, parsed.data);
    return apiSuccess({ saved: true });
  } catch (error) {
    log.error('Failed to save capture preferences', error instanceof Error ? error.message : error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, "Échec de l'enregistrement");
  }
}

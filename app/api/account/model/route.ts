/**
 * Modèle courant du compte, recopié côté serveur par l'application Qalem (session connectée).
 *
 * L'extension de capture n'a aucun moyen de choisir un modèle : elle utilise celui-ci. La valeur
 * doit désigner un fournisseur que le serveur sait résoudre, sinon elle est refusée.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { saveAccountModel } from '@/lib/capture/preferences';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';

const log = createLogger('AccountModelAPI');

const bodySchema = z.strictObject({ model: z.string().trim().min(3).max(200) });

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Modèle invalide');

  try {
    await resolveModel({ modelString: parsed.data.model });
  } catch {
    return apiError(API_ERROR_CODES.MODEL_UNAVAILABLE, 422, "Ce modèle n'est pas disponible");
  }
  try {
    await saveAccountModel(auth.user.id, parsed.data.model);
    return apiSuccess({ saved: true });
  } catch (error) {
    log.error('Failed to save account model', error instanceof Error ? error.message : error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, "Échec de l'enregistrement");
  }
}

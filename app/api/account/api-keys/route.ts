/**
 * Clés d'API personnelles de la personne connectée (modèles de langage).
 *
 * GET    — fournisseurs acceptés et clés enregistrées (fournisseur, quatre derniers caractères) ;
 * PUT    — { providerId, apiKey } : la clé est essayée chez le fournisseur, puis chiffrée ;
 * DELETE — ?providerId= : la clé est effacée, la plateforme reprend la main.
 *
 * Une clé n'est jamais renvoyée, ni journalisée. Elle ne sert qu'à la personne qui l'a ajoutée.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  PersonalKeyError,
  deletePersonalKey,
  isPersonalKeyProvider,
  listPersonalKeys,
  parseApiKey,
  personalKeyProviders,
  savePersonalKey,
  verifyPersonalKey,
} from '@/lib/server/user-api-keys';

export const dynamic = 'force-dynamic';
const log = createLogger('AccountApiKeysAPI');

const putSchema = z.strictObject({
  providerId: z.string().trim().min(1).max(40),
  apiKey: z.string(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  try {
    return apiSuccess({
      providers: personalKeyProviders(),
      keys: await listPersonalKeys(auth.user.id, 'llm'),
    });
  } catch (error) {
    log.error('Failed to list personal keys', error instanceof Error ? error.message : error);
    return apiError('INTERNAL_ERROR', 500, 'Lecture impossible');
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPersonalKeyProvider(parsed.data.providerId)) {
    return apiError('INVALID_REQUEST', 400, 'Fournisseur invalide');
  }
  const { providerId } = parsed.data;

  try {
    const apiKey = parseApiKey(parsed.data.apiKey);
    await verifyPersonalKey(providerId, apiKey);
    await savePersonalKey({ userId: auth.user.id, kind: 'llm', providerId, apiKey });
    return apiSuccess({ saved: true, hint: apiKey.slice(-4) });
  } catch (error) {
    if (error instanceof PersonalKeyError) {
      if (error.code === 'KEY_REJECTED') {
        return apiError('INVALID_REQUEST', 422, 'Le fournisseur refuse cette clé');
      }
      if (error.code === 'VERIFY_UNAVAILABLE') {
        return apiError('UPSTREAM_ERROR', 502, 'Le fournisseur ne répond pas, réessayez');
      }
      return apiError('INVALID_REQUEST', 400, 'Clé invalide');
    }
    log.error('Failed to save personal key', error instanceof Error ? error.message : error);
    return apiError('INTERNAL_ERROR', 500, "Échec de l'enregistrement");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const providerId = request.nextUrl.searchParams.get('providerId') ?? '';
  if (!isPersonalKeyProvider(providerId)) {
    return apiError('INVALID_REQUEST', 400, 'Fournisseur invalide');
  }
  try {
    const deleted = await deletePersonalKey(auth.user.id, 'llm', providerId);
    return apiSuccess({ deleted });
  } catch (error) {
    log.error('Failed to delete personal key', error instanceof Error ? error.message : error);
    return apiError('INTERNAL_ERROR', 500, 'Suppression impossible');
  }
}

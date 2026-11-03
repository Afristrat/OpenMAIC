import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { listSharedWithUser } from '@/lib/server/stage-grants';

const log = createLogger('SharedWithMe');

/** Formations qu'une personne a reçues une par une (jamais celles d'une organisation entière). */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  try {
    return apiSuccess({ classrooms: await listSharedWithUser(auth.user.id) });
  } catch (error) {
    log.error('Failed to list classrooms shared with user', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de lecture des formations reçues');
  }
}

/**
 * GET /api/youtube/draft?exportJobId=…&chapterIndex=… : métadonnées préremplies d'une publication
 * (titre, description, étiquettes, catégorie, langue), tirées de la formation, sans appel à l'IA.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { loadYoutubeExport } from '@/lib/server/youtube-export-context';
import { buildYoutubeDraft } from '@/lib/youtube/metadata';
import { parseChapterIndex } from '@/lib/server/youtube-publish-input';

export const dynamic = 'force-dynamic';
const log = createLogger('YoutubeDraftAPI');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const exportJobId = params.get('exportJobId') ?? '';
  const chapterIndex = parseChapterIndex(params.get('chapterIndex'));
  if (!UUID.test(exportJobId)) return apiError('INVALID_REQUEST', 400, 'exportJobId invalide');
  if (chapterIndex === undefined) return apiError('INVALID_REQUEST', 400, 'chapterIndex invalide');

  try {
    const lookup = await loadYoutubeExport(auth.user.id, exportJobId, chapterIndex);
    if (!lookup.ok) return apiError('INVALID_REQUEST', lookup.status, lookup.message);
    const { context } = lookup;
    return apiSuccess({
      draft: buildYoutubeDraft({
        courseName: context.courseName,
        courseDescription: context.courseDescription,
        language: context.language,
        scenes: context.scenes,
        chapterIndex,
      }),
    });
  } catch (error) {
    log.error('YouTube draft failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Brouillon de publication indisponible');
  }
}

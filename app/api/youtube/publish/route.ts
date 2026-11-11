/**
 * POST /api/youtube/publish — publie un export fini sur la chaîne YouTube de la personne.
 *
 * Body : { exportJobId, chapterIndex?, title, description?, tags?, categoryId?, defaultLanguage? }.
 *  - export `video` : la vidéo entière du cours (pas de chapterIndex) ;
 *  - export `mp4`   : un chapitre (scène) de l'archive, désigné par chapterIndex.
 * L'export doit appartenir à la personne (lecture sous sa session, politique RLS). La vidéo est
 * toujours « non répertoriée » et déclarée non destinée aux enfants ; l'envoi se fait dans un worker.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { enqueueYoutubeUpload } from '@/lib/jobs/queue';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { readYoutubeChannel } from '@/lib/server/youtube';
import { parsePublishInput } from '@/lib/server/youtube-publish-input';

export const dynamic = 'force-dynamic';
const log = createLogger('YoutubePublishAPI');

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const parsed = parsePublishInput(await request.json().catch(() => null));
  if (!parsed.ok) return apiError('INVALID_REQUEST', 400, parsed.message);
  const input = parsed.value;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: job } = await supabase
      .from('export_jobs')
      .select('id, format, status, scene_count, owner_id')
      .eq('id', input.exportJobId)
      .maybeSingle();
    if (!job || job.owner_id !== auth.user.id) {
      return apiError('INVALID_REQUEST', 404, 'Export introuvable');
    }
    if (job.status !== 'done') return apiError('INVALID_REQUEST', 409, "L'export n'est pas prêt");

    if (job.format === 'video') {
      if (input.chapterIndex !== null) {
        return apiError('INVALID_REQUEST', 400, 'Cet export est une vidéo unique, sans chapitre');
      }
    } else if (job.format === 'mp4') {
      if (input.chapterIndex === null || input.chapterIndex >= (job.scene_count ?? 0)) {
        return apiError('INVALID_REQUEST', 400, 'Chapitre inconnu dans cet export');
      }
    } else {
      return apiError('INVALID_REQUEST', 400, "Ce format d'export n'est pas une vidéo");
    }

    if (!(await readYoutubeChannel(auth.user.id))) {
      return apiError('NO_ORGANIZATION', 409, "Aucune chaîne YouTube n'est connectée");
    }

    const service = createServiceSupabaseClient();
    // Un envoi déjà en file ou en cours pour ce même contenu n'est pas doublé.
    let running = service
      .from('youtube_uploads')
      .select('id, status')
      .eq('user_id', auth.user.id)
      .eq('export_job_id', input.exportJobId)
      .in('status', ['queued', 'uploading']);
    running =
      input.chapterIndex === null
        ? running.is('chapter_index', null)
        : running.eq('chapter_index', input.chapterIndex);
    const { data: existing } = await running.limit(1).maybeSingle();
    if (existing)
      return apiSuccess({ id: existing.id, status: existing.status, reused: true }, 202);

    const { data: upload, error } = await service
      .from('youtube_uploads')
      .insert({
        user_id: auth.user.id,
        export_job_id: input.exportJobId,
        chapter_index: input.chapterIndex,
        title: input.title,
        description: input.description,
        tags: input.tags,
        category_id: input.categoryId,
        default_language: input.defaultLanguage,
        privacy_status: 'unlisted',
      })
      .select('id, status')
      .single();
    if (error || !upload) throw new Error(error?.message ?? 'insert failed');

    await enqueueYoutubeUpload({ uploadId: upload.id });
    return apiSuccess({ id: upload.id, status: upload.status }, 202);
  } catch (error) {
    log.error('YouTube publication request failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Publication YouTube impossible');
  }
}

/**
 * GET    /api/youtube/connection — la chaîne connectée de la personne et ses derniers envois.
 * DELETE /api/youtube/connection — déconnexion : jeton révoqué chez Google puis effacé.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  deleteYoutubeConnection,
  readYoutubeChannel,
  youtubeOAuthConfig,
} from '@/lib/server/youtube';

export const dynamic = 'force-dynamic';
const log = createLogger('YoutubeConnectionAPI');

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const channel = await readYoutubeChannel(auth.user.id);
    // Lecture sous la session de la personne : la politique RLS ne lui rend que ses envois.
    const supabase = await createServerSupabaseClient();
    const { data: uploads, error } = await supabase
      .from('youtube_uploads')
      .select(
        'id, export_job_id, chapter_index, title, status, video_id, applied_privacy, error, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const response = apiSuccess({
      configured: youtubeOAuthConfig() !== null,
      channel: channel ? { id: channel.channelId, title: channel.channelTitle } : null,
      uploads: (uploads ?? []).map((row) => ({
        id: row.id,
        exportJobId: row.export_job_id,
        chapterIndex: row.chapter_index,
        title: row.title,
        status: row.status,
        videoId: row.video_id,
        appliedPrivacy: row.applied_privacy,
        error: row.error,
        createdAt: row.created_at,
      })),
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    log.error('YouTube connection read failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Lecture de la connexion YouTube impossible');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  try {
    await deleteYoutubeConnection(auth.user.id);
    return apiSuccess({});
  } catch (error) {
    log.error('YouTube disconnection failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Déconnexion YouTube impossible');
  }
}

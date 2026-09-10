/**
 * GET /api/export-jobs/[id] — statut d'un job d'export (polling côté client
 * pendant le job BullMQ) et URL signée de téléchargement une fois `done`.
 *
 * Le téléchargement ne passe jamais par un accès direct client → Storage :
 * le bucket `exports` est privé et RLS interdit anon/authenticated (voir
 * 00021_export_jobs.sql) ; seule cette route, via le client service, émet
 * une URL signée à courte durée de vie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { privateArtifactUrl } from '@/lib/server/private-artifact-url';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  const { data: exportJob, error } = await supabase
    .from('export_jobs')
    .select(
      'id, stage_id, format, status, storage_path, scene_count, error, created_at, updated_at',
    )
    .eq('id', id)
    .single();

  if (error || !exportJob) {
    return apiError('INVALID_REQUEST', 404, "Job d'export introuvable");
  }

  let downloadUrl: string | null = null;
  const download = request.nextUrl.searchParams.get('download') === '1';
  if (exportJob.status === 'done' && exportJob.storage_path) {
    try {
      const extension = exportJob.format === 'mp4' ? 'mp4' : 'zip';
      if (exportJob.storage_path !== `${exportJob.stage_id}/${exportJob.id}.${extension}`)
        throw new Error();
      downloadUrl = await privateArtifactUrl(
        'exports',
        exportJob.storage_path,
        request.signal,
        download,
      );
    } catch {
      return apiError('INTERNAL_ERROR', 503, 'Export download unavailable');
    }
  }
  if (download) {
    if (!downloadUrl) return apiError('INVALID_REQUEST', 409, 'Export is not ready');
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: downloadUrl,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  const response = apiSuccess({
    id: exportJob.id,
    format: exportJob.format,
    status: exportJob.status,
    sceneCount: exportJob.scene_count,
    error: exportJob.error,
    downloadUrl,
    done: exportJob.status === 'done' || exportJob.status === 'error',
    pollIntervalMs: 5000,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

/**
 * GET /api/export-jobs/[id] — statut d'un job d'export (polling côté client
 * pendant le job BullMQ) et URL signée de téléchargement une fois `done`.
 *
 * Le téléchargement ne passe jamais par un accès direct client → Storage :
 * le bucket `exports` est privé et RLS interdit anon/authenticated (voir
 * 00021_export_jobs.sql) ; seule cette route, via le client service, émet
 * une URL signée à courte durée de vie.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const SIGNED_URL_EXPIRY_S = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  const { data: exportJob, error } = await supabase
    .from('export_jobs')
    .select('id, format, status, storage_path, scene_count, error, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !exportJob) {
    return apiError('INVALID_REQUEST', 404, "Job d'export introuvable");
  }

  let downloadUrl: string | null = null;
  if (exportJob.status === 'done' && exportJob.storage_path) {
    const serviceSupabase = createServiceSupabaseClient();
    const { data: signed } = await serviceSupabase.storage
      .from('exports')
      .createSignedUrl(exportJob.storage_path as string, SIGNED_URL_EXPIRY_S);
    downloadUrl = signed?.signedUrl ?? null;
  }

  return apiSuccess({
    id: exportJob.id,
    format: exportJob.format,
    status: exportJob.status,
    sceneCount: exportJob.scene_count,
    error: exportJob.error,
    downloadUrl,
    done: exportJob.status === 'done' || exportJob.status === 'error',
    pollIntervalMs: 5000,
  });
}

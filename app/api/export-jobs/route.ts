/**
 * Export Jobs API (S1-007/S1-008 — SCORM 1.2, SCORM 2004, cmi5 et MP4)
 *
 * POST /api/export-jobs — crée un job d'export pour un cours (stage) et
 * enfile un job BullMQ qui construit le package SCORM (voir
 * lib/jobs/workers.ts et lib/export/scorm/build-scorm-package.ts).
 *
 * Body: { stageId, format }.
 * Response: { success: boolean, id?: string, status?: string, error?: string }
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { enqueueExportJob } from '@/lib/jobs/queue';
import { createLogger } from '@/lib/logger';
import type { ExportJobFormat } from '@/lib/supabase/types';

const log = createLogger('ExportJobsAPI');

const SUPPORTED_FORMATS: ExportJobFormat[] = ['scorm12', 'scorm2004', 'cmi5', 'mp4'];

interface CreateExportJobBody {
  stageId?: string;
  format?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as CreateExportJobBody;
    const { stageId, format } = body;

    if (!stageId || !format) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId et format sont requis');
    }
    if (!SUPPORTED_FORMATS.includes(format as ExportJobFormat)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Format d'export non supporté: ${format} (supportés: ${SUPPORTED_FORMATS.join(', ')})`,
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id')
      .eq('id', stageId)
      .single();
    if (stageError || !stage) {
      return apiError('INVALID_REQUEST', 404, 'Cours introuvable');
    }

    const serviceSupabase = createServiceSupabaseClient();
    const { data: exportJob, error: insertError } = await serviceSupabase
      .from('export_jobs')
      .insert({
        stage_id: stageId,
        owner_id: auth.user.id,
        format: format as ExportJobFormat,
        status: 'queued',
      })
      .select('id, status')
      .single();

    if (insertError || !exportJob) {
      log.error('Failed to insert export job', insertError?.message);
      return apiError('INTERNAL_ERROR', 500, "Échec de la création du job d'export");
    }

    await enqueueExportJob({ exportJobId: exportJob.id as string });

    return apiSuccess({ id: exportJob.id, status: exportJob.status }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Export job creation failed:', error);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}

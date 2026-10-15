/**
 * Export Jobs API (S1-007/S1-008 — SCORM 1.2, SCORM 2004, cmi5 et MP4)
 *
 * POST /api/export-jobs — crée un job d'export pour un cours (stage) et
 * enfile un job BullMQ qui construit le package SCORM (voir
 * lib/jobs/workers.ts et lib/export/scorm/build-scorm-package.ts).
 *
 * Body: { stageId, format }.
 * Accès : tous les rôles de l'organisation au-dessus de l'apprenant (admin, manager, author,
 * formateur) et le super-admin ; voir requireSuperAdminOrOrgExporter. Un apprenant ne peut pas
 * exporter. Un cours sans organisation n'est exportable que par son propriétaire.
 * Response: { success: boolean, id?: string, status?: string, error?: string }
 */

import { NextRequest } from 'next/server';
import { isSuperAdminEmail, requireAuth, requireSuperAdminOrOrgExporter } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { readClassroomOwnership } from '@/lib/server/classroom-storage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { enqueueExportJob } from '@/lib/jobs/queue';
import { missingSpeechAudioMessage, summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
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

    const ownership = await readClassroomOwnership(stageId);
    if (!ownership) {
      return apiError('INVALID_REQUEST', 404, 'Cours introuvable');
    }
    if (ownership.orgId) {
      const exporter = await requireSuperAdminOrOrgExporter(request, ownership.orgId);
      if (exporter.response) return exporter.response;
    } else if (auth.user.id !== ownership.ownerId && !isSuperAdminEmail(auth.user.email)) {
      // Cours sans organisation : seul son propriétaire (ou le super-admin) l'exporte.
      return apiError(
        'INVALID_REQUEST',
        403,
        'Droit de modification requis pour exporter ce cours',
      );
    }

    const serviceSupabase = createServiceSupabaseClient();
    // Every export format needs a voice on every speech line: refuse now, with the fix, rather
    // than after a job that renders for minutes.
    const { data: sceneRows } = await serviceSupabase
      .from('scenes')
      .select('id, order, actions')
      .eq('stage_id', stageId)
      .order('order');
    const voices = summarizeSpeechAudio(
      (sceneRows ?? []) as unknown as Parameters<typeof summarizeSpeechAudio>[0],
    );
    if (voices.missing > 0) {
      return apiError(
        'MISSING_SPEECH_AUDIO',
        422,
        missingSpeechAudioMessage(voices, format === 'mp4' ? 'MP4' : 'LMS'),
      );
    }

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

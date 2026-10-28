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

/** Un job en file n'est repris que s'il est récent : au-delà, son worker est probablement perdu. */
const QUEUED_REUSE_WINDOW_MS = 30 * 60 * 1000;
/** Un job en cours n'est repris que s'il a donné signe de vie récemment (chaque scène rendue le met à jour). */
const ACTIVE_REUSE_WINDOW_MS = 20 * 60 * 1000;

const SUPPORTED_FORMATS: ExportJobFormat[] = ['scorm12', 'scorm2004', 'cmi5', 'mp4'];

interface CreateExportJobBody {
  stageId?: string;
  format?: string;
  /** La personne demande un courriel quand l'export est prêt (jamais envoyé sans cette demande). */
  notifyByEmail?: boolean;
}

/**
 * GET /api/export-jobs — les exports de la personne connectée, du plus récent au plus ancien.
 * Alimente la page « Mes exports » ; le téléchargement passe par GET /api/export-jobs/[id]?download=1,
 * qui signe une URL fraîche à chaque clic.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { data, error } = await createServiceSupabaseClient()
    .from('export_jobs')
    .select('id, stage_id, format, status, created_at, stages(name)')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    log.error('Failed to list export jobs', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la lecture des exports');
  }

  const exports = (data ?? []).map((row) => {
    const stage = row.stages as { name?: string } | { name?: string }[] | null;
    const courseName = Array.isArray(stage) ? stage[0]?.name : stage?.name;
    return {
      id: row.id as string,
      stageId: row.stage_id as string,
      courseName: courseName?.trim() || null,
      format: row.format as string,
      status: row.status as string,
      createdAt: row.created_at as string,
    };
  });
  const response = apiSuccess({ exports });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as CreateExportJobBody;
    const { stageId, format } = body;
    const notifyEmail = body.notifyByEmail === true;

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

    // Un rendu déjà en cours pour ce cours, lancé par la même personne, est repris et non doublé : le rendu est long et lourd.
    // (Le suivi d'un job n'est lisible que par son propriétaire : on ne reprend pas celui d'un autre.)
    const now = Date.now();
    const queuedSince = new Date(now - QUEUED_REUSE_WINDOW_MS).toISOString();
    const activeSince = new Date(now - ACTIVE_REUSE_WINDOW_MS).toISOString();
    const { data: running } = await serviceSupabase
      .from('export_jobs')
      .select('id, status')
      .eq('stage_id', stageId)
      .eq('format', format)
      .eq('owner_id', auth.user.id)
      .or(
        `and(status.eq.queued,created_at.gt.${queuedSince}),and(status.eq.generating,updated_at.gt.${activeSince})`,
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (running) {
      // Reprendre un rendu en cours n'efface pas une demande de courriel faite en le relançant.
      if (notifyEmail) {
        await serviceSupabase
          .from('export_jobs')
          .update({ notify_email: true })
          .eq('id', running.id);
      }
      return apiSuccess({ id: running.id, status: running.status, reused: true }, 202);
    }

    const { data: exportJob, error: insertError } = await serviceSupabase
      .from('export_jobs')
      .insert({
        stage_id: stageId,
        owner_id: auth.user.id,
        format: format as ExportJobFormat,
        status: 'queued',
        notify_email: notifyEmail,
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

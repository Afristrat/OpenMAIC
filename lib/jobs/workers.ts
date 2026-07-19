/**
 * BullMQ Worker Implementations for Qalem
 *
 * Each worker processes jobs from its respective queue. The actual business
 * logic is delegated to existing functions in the codebase — workers merely
 * provide the async wrapper, error handling, and metrics reporting.
 *
 * To start workers, import and call `startAllWorkers()` from your server
 * entry-point (e.g. a standalone worker process or a custom server script).
 *
 * NOTE: Workers are NOT auto-started inside Next.js API routes. They should
 * run in a dedicated process (see docker-compose or scripts/).
 */

import { Worker, type Job } from 'bullmq';
import { incrementCounter } from '@/app/api/metrics/route';
import { createLogger } from '@/lib/logger';
import { isFeatureEnabled } from '@/lib/flags';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  createHyperframesProduction,
  getHyperframesProduction,
} from '@/lib/video/hyperframes-client';
import type { HyperframesBrief } from '@/lib/video/hyperframes-types';
import type { VideoCapsuleStatus, VideoCapsuleVariant } from '@/lib/supabase/types';
import { buildScormPackage } from '@/lib/export/scorm/build-scorm-package';
import { buildClassroomVideo } from '@/lib/export/mp4/build-classroom-video';

const log = createLogger('Workers');

// ---------------------------------------------------------------------------
// Connection (mirrors queue.ts)
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 6379,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisUrl(REDIS_URL);

// ---------------------------------------------------------------------------
// Guard: workers should only be started by the dedicated worker process
// ---------------------------------------------------------------------------

let workersStarted = false;
let workers: Worker[] = [];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Create and start all BullMQ workers.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startAllWorkers(): void {
  if (workersStarted) return;
  workersStarted = true;

  // ---- Classroom generation worker ----
  const classroomWorker = new Worker(
    'classroom-generation',
    async (job: Job) => {
      const { requirements, userId, stageId } = job.data as {
        requirements: unknown;
        userId: string;
        stageId: string;
      };

      // TODO: delegate to lib/generation/pipeline-runner.ts once it exposes
      // a non-streaming entrypoint. For now, log and succeed.
      log.info(`Processing job ${job.id} for user=${userId} stage=${stageId}`, {
        requirementsKeys: requirements ? Object.keys(requirements as Record<string, unknown>) : [],
      });

      incrementCounter('qalem_jobs_processed_total', { queue: 'classroom-generation' });
    },
    { connection, concurrency: 2 },
  );

  // ---- TTS batch worker ----
  const ttsWorker = new Worker(
    'tts-batch',
    async (job: Job) => {
      const { actions, stageId } = job.data as {
        actions: Array<{ id: string; text: string; voice: string }>;
        stageId: string;
      };

      // TODO: iterate actions and call generateTTS() from lib/audio/tts-providers.ts
      // with cache integration from lib/audio/tts-cache.ts.
      log.info(`Processing ${actions.length} TTS actions for stage=${stageId} (job ${job.id})`);

      incrementCounter('qalem_jobs_processed_total', { queue: 'tts-batch' });
    },
    { connection, concurrency: 4 },
  );

  // ---- Notification worker ----
  const notificationWorker = new Worker(
    'notifications',
    async (job: Job) => {
      const { userId, type, channels } = job.data as {
        userId: string;
        type: string;
        channels: string[];
      };

      // TODO: delegate to a notification service (email via Resend/SES,
      // push via Web Push, WhatsApp via Evolution API).
      log.info(`Sending ${type} to user=${userId} via ${channels.join(', ')} (job ${job.id})`);

      incrementCounter('qalem_jobs_processed_total', { queue: 'notifications' });
    },
    { connection, concurrency: 5 },
  );

  // ---- Telemetry worker ----
  const telemetryWorker = new Worker(
    'telemetry',
    async (job: Job) => {
      const { type, payload } = job.data as { type: string; payload: unknown };

      // TODO: route telemetry to the appropriate sink:
      // - 'xapi' → xAPI LRS endpoint
      // - 'pedagogy' → Supabase analytics table
      // - 'discussion' → Supabase analytics table
      log.info(`Processing ${type} telemetry (job ${job.id})`, { payloadType: typeof payload });

      incrementCounter('qalem_jobs_processed_total', { queue: 'telemetry' });
    },
    { connection, concurrency: 10 },
  );

  // ---- Video capsule worker (Mishkāt/Hyperframes, S1-006) ----
  const videoCapsuleWorker = new Worker(
    'video-capsule',
    async (job: Job) => {
      const { capsuleId } = job.data as { capsuleId: string };
      const supabase = createServiceSupabaseClient();

      const enabled = await isFeatureEnabled('video_capsules');
      if (!enabled) {
        log.warn(`Video capsule ${capsuleId} skipped: flag video_capsules disabled`);
        await supabase
          .from('video_capsules')
          .update({ status: 'error', error: 'video_capsules feature flag disabled' })
          .eq('id', capsuleId);
        return;
      }

      const { data: capsule, error: readError } = await supabase
        .from('video_capsules')
        .select('id, brief, mishkat_production_id')
        .eq('id', capsuleId)
        .single();

      if (readError || !capsule) {
        throw new Error(`Video capsule ${capsuleId} not found: ${readError?.message ?? 'no row'}`);
      }

      try {
        let productionId = capsule.mishkat_production_id as string | null;
        if (!productionId) {
          const production = await createHyperframesProduction(capsule.brief as HyperframesBrief);
          productionId = production.id;
          await supabase
            .from('video_capsules')
            .update({ status: 'generating', mishkat_production_id: productionId })
            .eq('id', capsuleId);
        }

        const POLL_INTERVAL_MS = 5000;
        const renderTimeoutMs = Math.max(
          60_000,
          Number(process.env.MISHKAT_RENDER_TIMEOUT_MS) || 30 * 60_000,
        );
        const maxAttempts = Math.ceil(renderTimeoutMs / POLL_INTERVAL_MS);

        let lastStatus: VideoCapsuleStatus = 'generating';
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const production = await getHyperframesProduction(productionId);

          if (production.status !== lastStatus) {
            lastStatus = production.status;
            await supabase
              .from('video_capsules')
              .update({ status: lastStatus })
              .eq('id', capsuleId);
          }

          if (production.status === 'done') {
            await supabase
              .from('video_capsules')
              .update({
                status: 'done',
                variants: (production.variants ?? []) as VideoCapsuleVariant[],
              })
              .eq('id', capsuleId);
            incrementCounter('qalem_jobs_processed_total', { queue: 'video-capsule' });
            return;
          }

          if (production.status === 'error') {
            await supabase
              .from('video_capsules')
              .update({ status: 'error', error: production.error ?? 'Mishkāt production error' })
              .eq('id', capsuleId);
            incrementCounter('qalem_jobs_failed_total', { queue: 'video-capsule' });
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        await supabase
          .from('video_capsules')
          .update({ status: 'error', error: 'Timed out waiting for Mishkāt production' })
          .eq('id', capsuleId);
        incrementCounter('qalem_jobs_failed_total', { queue: 'video-capsule' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase
          .from('video_capsules')
          .update({ status: 'error', error: message })
          .eq('id', capsuleId);
        throw err;
      }
    },
    { connection, concurrency: 2 },
  );

  // ---- Export job worker (SCORM couche 1, S1-007) ----
  const exportJobWorker = new Worker(
    'export-job',
    async (job: Job) => {
      const { exportJobId } = job.data as { exportJobId: string };
      const supabase = createServiceSupabaseClient();

      const { data: exportJob, error: readError } = await supabase
        .from('export_jobs')
        .select('id, stage_id, format')
        .eq('id', exportJobId)
        .single();

      if (readError || !exportJob) {
        throw new Error(`Export job ${exportJobId} not found: ${readError?.message ?? 'no row'}`);
      }

      try {
        await supabase.from('export_jobs').update({ status: 'generating' }).eq('id', exportJobId);

        const isMp4 = exportJob.format === 'mp4';
        let file: Buffer;
        let sceneCount: number;
        if (isMp4) {
          const result = await buildClassroomVideo(exportJob.stage_id as string);
          file = result.video;
          sceneCount = result.sceneCount;
        } else {
          const result = await buildScormPackage(exportJob.stage_id as string);
          file = result.zip;
          sceneCount = result.sceneCount;
        }
        const storagePath = `${exportJob.stage_id}/${exportJobId}.${isMp4 ? 'mp4' : 'scorm12.zip'}`;
        const { error: uploadError } = await supabase.storage
          .from('exports')
          .upload(storagePath, file, {
            contentType: isMp4 ? 'video/mp4' : 'application/zip',
            upsert: true,
          });
        if (uploadError) {
          throw new Error(`Échec du dépôt de l'export ${exportJob.format}: ${uploadError.message}`);
        }

        await supabase
          .from('export_jobs')
          .update({ status: 'done', storage_path: storagePath, scene_count: sceneCount })
          .eq('id', exportJobId);

        incrementCounter('qalem_jobs_processed_total', { queue: 'export-job' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase
          .from('export_jobs')
          .update({ status: 'error', error: message })
          .eq('id', exportJobId);
        incrementCounter('qalem_jobs_failed_total', { queue: 'export-job' });
        throw err;
      }
    },
    { connection, concurrency: 2 },
  );

  workers = [
    classroomWorker,
    ttsWorker,
    notificationWorker,
    telemetryWorker,
    videoCapsuleWorker,
    exportJobWorker,
  ];

  // Attach default error handlers to all workers so unhandled failures
  // get logged (and counted) rather than silently swallowed.
  for (const w of workers) {
    w.on('failed', (job, err) => {
      log.error(`Job ${job?.id} failed in ${w.name}:`, err.message);
      incrementCounter('qalem_jobs_failed_total', { queue: w.name });
    });
  }

  log.info(`Started ${workers.length} BullMQ workers: ${workers.map((w) => w.name).join(', ')}`);
}

/**
 * Gracefully shut down all workers. Call this on SIGTERM / SIGINT.
 */
export async function stopAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}

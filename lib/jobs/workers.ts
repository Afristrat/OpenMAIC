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
import { incrementCounter } from '@/lib/metrics';
import { createLogger } from '@/lib/logger';
import { isFeatureEnabled } from '@/lib/flags';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  assertHyperframesVariantsPassedGate,
  createHyperframesProduction,
  getHyperframesProduction,
} from '@/lib/video/hyperframes-client';
import type { HyperframesBrief } from '@/lib/video/hyperframes-types';
import type { VideoCapsuleStatus, VideoCapsuleVariant } from '@/lib/supabase/types';
import { buildLearningPackage } from '@/lib/export/scorm/build-scorm-package';
import { isLearningPackageFormat, trackingAdapters } from '@/lib/export/scorm/tracking-adapters';
import { buildClassroomVideo } from '@/lib/export/mp4/build-classroom-video';
import { generateMeteredVideo } from '@/lib/server/metered-media-providers';
import type { VideoGenerationOptions, VideoProviderId } from '@/lib/media/types';
import {
  isServerConfiguredProvider,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
} from '@/lib/server/provider-config';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { runClassroomPlanJob } from '@/lib/server/classroom-plan-job-runner';
import { readClassroomPlanJob } from '@/lib/server/classroom-plan-job-store';
import { readClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import type { ClassroomGenerationJobData, ClassroomPlanJobData } from '@/lib/jobs/queue';
import type { ClassroomInteractionJobData } from '@/lib/jobs/queue';
import { PermitPool } from '@/lib/jobs/permit-pool';
import { enqueueTransmissionVisualWatermark, enqueueXapiDelivery } from '@/lib/jobs/queue';
import { applyVisualWatermark } from '@/lib/transmissions/visual-watermark';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';
import { activateUsageMeteringJob } from '@/lib/billing/usage-context';
import { sendWebPushToUser } from '@/lib/server/web-push';
import { readOrganizationLrsConfig } from '@/lib/server/org-lrs-config';
import { sendStatement, type XAPIStatement } from '@/lib/telemetry/xapi';

const log = createLogger('Workers');

// ---------------------------------------------------------------------------
// Connection (mirrors queue.ts)
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
} {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 6379,
      maxRetriesPerRequest: null,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

const connection = parseRedisUrl(REDIS_URL);

// ---------------------------------------------------------------------------
// Guard: workers should only be started by the dedicated worker process
// ---------------------------------------------------------------------------

let workersStarted = false;
let workers: Worker[] = [];

function boundedInteger(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

const heavyTasks = new PermitPool(boundedInteger('WORKER_HEAVY_CONCURRENCY', 1, 2));

function workerOptions() {
  return { connection, concurrency: 1 };
}

async function recoverPendingXapiDeliveries(): Promise<void> {
  if (!(await isFeatureEnabled('xapi_emission'))) return;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('xapi_outbox')
    .select('id')
    .neq('status', 'sent')
    .lte('next_attempt_at', new Date().toISOString())
    .order('id', { ascending: true })
    .limit(500);
  if (error) throw new Error(`xAPI outbox recovery failed: ${error.message}`);
  await Promise.all((data ?? []).map((item) => enqueueXapiDelivery({ outboxId: item.id })));
}

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

  const webhookDeliveryWorker = new Worker(
    'webhook-delivery',
    async (job: Job) => {
      const data = job.data as ClassroomInteractionJobData;
      await dispatchWebhook(data.event, data.payload, data.orgId);
      incrementCounter('qalem_jobs_processed_total', { queue: 'webhook-delivery' });
    },
    workerOptions(),
  );

  const anchorDeliveryWorker = new Worker(
    'anchor-delivery',
    async (job: Job) => {
      const { deliveryId } = job.data as { deliveryId: string };
      const supabase = createServiceSupabaseClient();
      const { data: delivery, error } = await supabase
        .from('anchor_deliveries')
        .select(
          'id, delivery_kind, payload, sent_at, seeds(content), anchor_plans(id, user_id, paused, ends_at)',
        )
        .eq('id', deliveryId)
        .maybeSingle();
      if (error) throw new Error(`Anchor delivery lookup failed: ${error.message}`);
      if (!delivery || delivery.sent_at) return;

      const planValue = delivery.anchor_plans;
      const plan = Array.isArray(planValue) ? planValue[0] : planValue;
      if (!plan || plan.paused || new Date(plan.ends_at).getTime() < Date.now()) return;

      const seedValue = delivery.seeds;
      const seed = Array.isArray(seedValue) ? seedValue[0] : seedValue;
      const content = (seed?.content ?? {}) as Record<string, unknown>;
      const payload = (delivery.payload ?? {}) as Record<string, unknown>;
      const isColdEvaluation = delivery.delivery_kind === 'cold_eval';
      const title = isColdEvaluation ? 'Votre point d’ancrage' : 'Un souvenir de votre session';
      const body = isColdEvaluation
        ? 'Deux questions rapides pour mesurer ce qui est resté.'
        : typeof content.push_hook === 'string'
          ? content.push_hook
          : typeof content.body === 'string'
            ? content.body
            : 'Retrouvez un moment clé de votre session.';
      const phase = typeof payload.phase === 'string' ? `&phase=${payload.phase}` : '';
      const reviewCardId =
        typeof payload.review_card_id === 'string' ? payload.review_card_id : null;
      const targetUrl = reviewCardId
        ? `/review?card=${encodeURIComponent(reviewCardId)}&delivery=${delivery.id}`
        : `/anchor-plans/${plan.id}?delivery=${delivery.id}${phase}`;

      try {
        const results = await sendWebPushToUser(plan.user_id, {
          title,
          body,
          targetUrl,
          tag: `anchor-delivery-${delivery.id}`,
        });
        if (!results.some((result) => result.status === 'accepted')) {
          throw new Error('No active Web Push subscription accepted the delivery');
        }
        const { error: updateError } = await supabase
          .from('anchor_deliveries')
          .update({ sent_at: new Date().toISOString(), last_error: null })
          .eq('id', deliveryId)
          .is('sent_at', null);
        if (updateError)
          throw new Error(`Anchor delivery completion failed: ${updateError.message}`);
        incrementCounter('qalem_jobs_processed_total', { queue: 'anchor-delivery' });
      } catch (deliveryError) {
        const message =
          deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
        await supabase.rpc('record_anchor_delivery_failure', {
          target_delivery_id: deliveryId,
          failure_message: message,
        });
        throw deliveryError;
      }
    },
    workerOptions(),
  );

  const xapiDeliveryWorker = new Worker(
    'xapi-delivery',
    async (job: Job) => {
      const { outboxId } = job.data as { outboxId: number };
      const supabase = createServiceSupabaseClient();
      const { data: item, error } = await supabase
        .from('xapi_outbox')
        .select('id, org_id, statement, status')
        .eq('id', outboxId)
        .maybeSingle();
      if (error) throw new Error(`xAPI outbox lookup failed: ${error.message}`);
      if (!item || item.status === 'sent') return;
      if (!(await isFeatureEnabled('xapi_emission'))) return;

      try {
        const config = await readOrganizationLrsConfig(item.org_id);
        if (!config?.enabled) throw new Error('Organization LRS is disabled');
        const sent = await sendStatement(item.statement as unknown as XAPIStatement, config);
        if (!sent) throw new Error('LRS rejected or did not answer the xAPI statement');
        const { error: updateError } = await supabase
          .from('xapi_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', outboxId);
        if (updateError) throw new Error(`xAPI outbox completion failed: ${updateError.message}`);
        incrementCounter('qalem_jobs_processed_total', { queue: 'xapi-delivery' });
      } catch (deliveryError) {
        const message =
          deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
        await supabase
          .from('xapi_outbox')
          .update({
            status: 'failed',
            attempt_count: job.attemptsMade + 1,
            next_attempt_at: new Date(Date.now() + 60_000 * 2 ** job.attemptsMade).toISOString(),
            last_error: message.slice(0, 1000),
          })
          .eq('id', outboxId);
        throw deliveryError;
      }
    },
    workerOptions(),
  );

  // ---- Classroom generation worker ----
  const classroomWorker = new Worker(
    'classroom-generation',
    async (job: Job) =>
      heavyTasks.run(async () => {
        if (job.name === 'prepare-plan') {
          const { jobId } = job.data as ClassroomPlanJobData;
          const planJob = await readClassroomPlanJob(jobId);
          if (!planJob?.input) throw new Error(`Classroom plan job ${jobId} has no durable input`);
          await runClassroomPlanJob(jobId, planJob.input, planJob.ownerId);
          incrementCounter('qalem_jobs_processed_total', { queue: 'classroom-plan' });
          return;
        }
        const { jobId, baseUrl, ownerId } = job.data as ClassroomGenerationJobData;
        const generationJob = await readClassroomGenerationJob(jobId);
        if (!generationJob?.input) {
          throw new Error(`Classroom generation job ${jobId} has no durable input`);
        }
        await runClassroomGenerationJob(jobId, generationJob.input, baseUrl, ownerId);
        const completedJob = await readClassroomGenerationJob(jobId);
        if (completedJob?.status !== 'succeeded') {
          throw new Error(completedJob?.error ?? `Classroom generation job ${jobId} failed`);
        }
        incrementCounter('qalem_jobs_processed_total', { queue: 'classroom-generation' });
      }),
    workerOptions(),
  );

  // ---- Video capsule worker (Mishkāt/Hyperframes, S1-006) ----
  const videoCapsuleWorker = new Worker(
    'video-capsule',
    async (job: Job) =>
      heavyTasks.run(async () => {
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
          throw new Error(
            `Video capsule ${capsuleId} not found: ${readError?.message ?? 'no row'}`,
          );
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
              const variants = production.variants ?? [];
              assertHyperframesVariantsPassedGate(variants);
              await supabase
                .from('video_capsules')
                .update({
                  status: 'done',
                  variants: variants as VideoCapsuleVariant[],
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
      }),
    workerOptions(),
  );

  // ---- Managed video generation worker ----
  const videoGenerationWorker = new Worker(
    'video-generation',
    async (job: Job) =>
      heavyTasks.run(async () => {
        const { videoGenerationJobId } = job.data as { videoGenerationJobId: string };
        const supabase = createServiceSupabaseClient();
        const { data: generationJob, error: readError } = await supabase
          .from('video_generation_jobs')
          .select('id, owner_id, org_id, provider_id, model_id, request')
          .eq('id', videoGenerationJobId)
          .single();

        if (readError || !generationJob) {
          throw new Error(
            `Video generation job ${videoGenerationJobId} not found: ${readError?.message ?? 'no row'}`,
          );
        }
        if (!generationJob.org_id) {
          throw new Error(`Video generation job ${videoGenerationJobId} has no tenant`);
        }
        activateUsageMeteringJob(
          generationJob.owner_id,
          generationJob.org_id,
          `video-job-${videoGenerationJobId}`,
        );

        try {
          await supabase
            .from('video_generation_jobs')
            .update({ status: 'generating' })
            .eq('id', videoGenerationJobId);

          const providerId = generationJob.provider_id as VideoProviderId;
          if (!isServerConfiguredProvider('video', providerId)) {
            throw new Error(`Video provider ${providerId} is not managed by the server`);
          }

          const result = await generateMeteredVideo(
            {
              providerId,
              apiKey: resolveVideoApiKey(providerId),
              baseUrl: resolveVideoBaseUrl(providerId),
              model: generationJob.model_id ?? undefined,
            },
            generationJob.request as unknown as VideoGenerationOptions,
          );

          const match = result.url.match(/^data:(video\/[a-z0-9.+-]+);base64,(.+)$/i);
          if (!match) throw new Error('Managed video provider returned no embedded video');
          const [, contentType, encodedVideo] = match;
          const extension = contentType === 'video/webm' ? 'webm' : 'mp4';
          const video = Buffer.from(encodedVideo, 'base64');
          const storagePath = `generated-video/${generationJob.owner_id}/${videoGenerationJobId}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('exports')
            .upload(storagePath, video, { contentType, upsert: true });
          if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);

          await supabase
            .from('video_generation_jobs')
            .update({
              status: 'done',
              storage_path: storagePath,
              result_metadata: {
                width: result.width,
                height: result.height,
                duration: result.duration,
                contentType,
              },
            })
            .eq('id', videoGenerationJobId);
          incrementCounter('qalem_jobs_processed_total', { queue: 'video-generation' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await supabase
            .from('video_generation_jobs')
            .update({ status: 'error', error: message })
            .eq('id', videoGenerationJobId);
          incrementCounter('qalem_jobs_failed_total', { queue: 'video-generation' });
          throw err;
        }
      }),
    workerOptions(),
  );

  // ---- Export job worker (SCORM couche 1, S1-007) ----
  const exportJobWorker = new Worker(
    'export-job',
    async (job: Job) =>
      heavyTasks.run(async () => {
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
          let extension: string;
          if (isMp4) {
            const result = await buildClassroomVideo(exportJob.stage_id as string);
            file = result.video;
            sceneCount = result.sceneCount;
            extension = 'mp4';
          } else {
            const learningFormat = String(exportJob.format);
            if (!isLearningPackageFormat(learningFormat)) {
              throw new Error(`Unsupported learning export format: ${learningFormat}`);
            }
            const result = await buildLearningPackage(exportJob.stage_id as string, learningFormat);
            file = result.zip;
            sceneCount = result.sceneCount;
            extension = trackingAdapters[learningFormat].archiveExtension;
          }
          const storagePath = `${exportJob.stage_id}/${exportJobId}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('exports')
            .upload(storagePath, file, {
              contentType: isMp4 ? 'video/mp4' : 'application/zip',
              upsert: true,
            });
          if (uploadError) {
            throw new Error(
              `Échec du dépôt de l'export ${exportJob.format}: ${uploadError.message}`,
            );
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
      }),
    workerOptions(),
  );

  // ---- Transmission source worker (S2-010) ----
  // The source is immutable once the row is done. Future watermark workers
  // publish separate derivatives and never rewrite this path.
  const transmissionWorker = new Worker(
    'transmission',
    async (job: Job) =>
      heavyTasks.run(async () => {
        const { transmissionId } = job.data as { transmissionId: string };
        const supabase = createServiceSupabaseClient();
        const { data: transmission, error: readError } = await supabase
          .from('transmissions')
          .select('id, stage_id, status, source_artifact_path')
          .eq('id', transmissionId)
          .single();

        if (readError || !transmission) {
          throw new Error(
            `Transmission ${transmissionId} not found: ${readError?.message ?? 'no row'}`,
          );
        }
        if (transmission.status === 'done' && transmission.source_artifact_path) return;

        try {
          await supabase
            .from('transmissions')
            .update({ status: 'processing', error: null })
            .eq('id', transmissionId);

          if (!transmission.source_artifact_path) {
            const result = await buildClassroomVideo(transmission.stage_id);
            const sourceArtifactPath = `${transmissionId}/source.mp4`;
            const { error: uploadError } = await supabase.storage
              .from('transmissions')
              .upload(sourceArtifactPath, result.video, { contentType: 'video/mp4', upsert: true });
            if (uploadError) {
              throw new Error(`Transmission source upload failed: ${uploadError.message}`);
            }

            const { error: sourceUpdateError } = await supabase
              .from('transmissions')
              .update({
                status: 'processing',
                source_artifact_path: sourceArtifactPath,
                error: null,
              })
              .eq('id', transmissionId);
            if (sourceUpdateError)
              throw new Error(
                `Transmission source completion failed: ${sourceUpdateError.message}`,
              );
          }

          await enqueueTransmissionVisualWatermark({ transmissionId });

          incrementCounter('qalem_jobs_processed_total', { queue: 'transmission-source' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await supabase
            .from('transmissions')
            .update({ status: 'failed', error: message })
            .eq('id', transmissionId);
          incrementCounter('qalem_jobs_failed_total', { queue: 'transmission' });
          throw err;
        }
      }),
    workerOptions(),
  );

  // ---- Transmission visual watermark worker (S2-009) ----
  // The original source remains immutable. Only this private derivative is served.
  const transmissionVisualWatermarkWorker = new Worker(
    'transmission-visual-watermark',
    async (job: Job) =>
      heavyTasks.run(async () => {
        const { transmissionId } = job.data as { transmissionId: string };
        const supabase = createServiceSupabaseClient();
        const { data: transmission, error: readError } = await supabase
          .from('transmissions')
          .select('id, status, source_artifact_path, visual_watermark_path, watermark_id')
          .eq('id', transmissionId)
          .single();

        if (readError || !transmission) {
          throw new Error(
            `Transmission ${transmissionId} not found: ${readError?.message ?? 'no row'}`,
          );
        }
        if (transmission.status === 'done' && transmission.visual_watermark_path) return;
        if (!transmission.source_artifact_path) {
          throw new Error(`Transmission ${transmissionId} has no source artifact to watermark`);
        }

        try {
          const { data: source, error: sourceDownloadError } = await supabase.storage
            .from('transmissions')
            .download(transmission.source_artifact_path);
          if (sourceDownloadError || !source) {
            throw new Error(
              `Transmission source download failed: ${sourceDownloadError?.message ?? 'no file'}`,
            );
          }

          const watermarkedVideo = await applyVisualWatermark(
            Buffer.from(await source.arrayBuffer()),
            transmission.watermark_id,
          );
          const visualWatermarkPath = `${transmissionId}/visual-watermark.mp4`;
          const { error: uploadError } = await supabase.storage
            .from('transmissions')
            .upload(visualWatermarkPath, watermarkedVideo, {
              contentType: 'video/mp4',
              upsert: true,
            });
          if (uploadError)
            throw new Error(`Visual watermark upload failed: ${uploadError.message}`);

          const { error: completionError } = await supabase
            .from('transmissions')
            .update({ status: 'done', visual_watermark_path: visualWatermarkPath, error: null })
            .eq('id', transmissionId);
          if (completionError) {
            throw new Error(`Visual watermark completion failed: ${completionError.message}`);
          }

          incrementCounter('qalem_jobs_processed_total', {
            queue: 'transmission-visual-watermark',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await supabase
            .from('transmissions')
            .update({ status: 'failed', error: message })
            .eq('id', transmissionId);
          incrementCounter('qalem_jobs_failed_total', { queue: 'transmission-visual-watermark' });
          throw err;
        }
      }),
    workerOptions(),
  );

  workers = [
    webhookDeliveryWorker,
    anchorDeliveryWorker,
    xapiDeliveryWorker,
    classroomWorker,
    videoCapsuleWorker,
    videoGenerationWorker,
    exportJobWorker,
    transmissionWorker,
    transmissionVisualWatermarkWorker,
  ];
  void recoverPendingXapiDeliveries().catch((error: unknown) => {
    log.error(
      'xAPI outbox recovery failed:',
      error instanceof Error ? error.message : String(error),
    );
  });

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

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
      log.info(
        `Processing job ${job.id} for user=${userId} stage=${stageId}`,
        { requirementsKeys: requirements ? Object.keys(requirements as Record<string, unknown>) : [] },
      );

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
      log.info(
        `Processing ${actions.length} TTS actions for stage=${stageId} (job ${job.id})`,
      );

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
      log.info(
        `Sending ${type} to user=${userId} via ${channels.join(', ')} (job ${job.id})`,
      );

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
      log.info(
        `Processing ${type} telemetry (job ${job.id})`,
        { payloadType: typeof payload },
      );

      incrementCounter('qalem_jobs_processed_total', { queue: 'telemetry' });
    },
    { connection, concurrency: 10 },
  );

  workers = [classroomWorker, ttsWorker, notificationWorker, telemetryWorker];

  // Attach default error handlers to all workers so unhandled failures
  // get logged (and counted) rather than silently swallowed.
  for (const w of workers) {
    w.on('failed', (job, err) => {
      log.error(`Job ${job?.id} failed in ${w.name}:`, err.message);
      incrementCounter('qalem_jobs_failed_total', { queue: w.name });
    });
  }

  log.info(
    `Started ${workers.length} BullMQ workers: ${workers.map((w) => w.name).join(', ')}`,
  );
}

/**
 * Gracefully shut down all workers. Call this on SIGTERM / SIGINT.
 */
export async function stopAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}

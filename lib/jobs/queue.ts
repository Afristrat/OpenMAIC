/**
 * BullMQ Job Queues for Qalem
 *
 * Centralised queue definitions and enqueue helpers for async background jobs.
 * Each queue maps to a logical concern (classroom generation, TTS batching,
 * notifications, telemetry). Workers are defined in ./workers.ts.
 *
 * Requires a running Redis instance. Set REDIS_URL in your environment
 * (defaults to redis://localhost:6379 for local development).
 */

import { Queue, type JobsOptions } from 'bullmq';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Parse a redis:// URL into the IORedis-compatible connection object that
 * BullMQ expects. Falls back to localhost defaults when fields are missing.
 */
function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  lazyConnect: true;
  connectTimeout: number;
  maxRetriesPerRequest: number;
  enableOfflineQueue: false;
} {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 6379,
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };
  }
}

const connection = parseRedisUrl(REDIS_URL);

// ---------------------------------------------------------------------------
// Job type registry (for documentation / type narrowing)
// ---------------------------------------------------------------------------

export type JobType =
  | 'classroom-generation'
  | 'video-capsule'
  | 'video-generation'
  | 'export-job'
  | 'transmission'
  | 'transmission-visual-watermark';

export interface ClassroomGenerationJobData {
  jobId: string;
  baseUrl: string;
  ownerId: string;
}

const durableJobOptions: JobsOptions = {
  attempts: 1,
  removeOnComplete: { age: 24 * 60 * 60, count: 100 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
};

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export interface JobQueues {
  classroom: Queue;
  videoCapsule: Queue;
  videoGeneration: Queue;
  exportJob: Queue;
  transmission: Queue;
  transmissionVisualWatermark: Queue;
}

let queues: JobQueues | undefined;

/**
 * Instantiate BullMQ only when a runtime request actually needs Redis.
 * Next.js imports route modules while building its route manifest; creating
 * queues at module scope would make that compile-time analysis open sockets.
 */
export function getJobQueues(): JobQueues {
  queues ??= {
    classroom: new Queue('classroom-generation', { connection }),
    videoCapsule: new Queue('video-capsule', { connection }),
    videoGeneration: new Queue('video-generation', { connection }),
    exportJob: new Queue('export-job', { connection }),
    transmission: new Queue('transmission', { connection }),
    transmissionVisualWatermark: new Queue('transmission-visual-watermark', { connection }),
  };
  return queues;
}

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueClassroomGeneration(
  data: ClassroomGenerationJobData,
): Promise<string> {
  const job = await getJobQueues().classroom.add('generate', data, {
    ...durableJobOptions,
    jobId: `classroom-${data.jobId}`,
  });
  return job.id!;
}

export async function enqueueVideoCapsule(data: { capsuleId: string }): Promise<string> {
  const job = await getJobQueues().videoCapsule.add('render', data, durableJobOptions);
  return job.id!;
}

export async function enqueueVideoGeneration(data: {
  videoGenerationJobId: string;
}): Promise<string> {
  const job = await getJobQueues().videoGeneration.add('generate', data, durableJobOptions);
  return job.id!;
}

export async function enqueueExportJob(data: { exportJobId: string }): Promise<string> {
  const job = await getJobQueues().exportJob.add('generate', data, durableJobOptions);
  return job.id!;
}

export async function enqueueTransmission(data: { transmissionId: string }): Promise<string> {
  const queue = getJobQueues().transmission;
  const jobId = `transmission-${data.transmissionId}`;
  await removeFinishedJob(queue, jobId);
  const job = await queue.add('render-source', data, {
    ...durableJobOptions,
    jobId,
  });
  return job.id!;
}

export async function enqueueTransmissionVisualWatermark(data: {
  transmissionId: string;
}): Promise<string> {
  const queue = getJobQueues().transmissionVisualWatermark;
  const jobId = `transmission-visual-watermark-${data.transmissionId}`;
  await removeFinishedJob(queue, jobId);
  const job = await queue.add('burn-visual-watermark', data, {
    ...durableJobOptions,
    jobId,
  });
  return job.id!;
}

/**
 * A failed delivery is explicitly retriable by the sender. BullMQ keeps a
 * terminal job with its deterministic id, so remove only terminal jobs before
 * creating its successor; active jobs are never disturbed.
 */
async function removeFinishedJob(queue: Pick<Queue, 'getJob'>, jobId: string): Promise<void> {
  const previous = await queue.getJob(jobId);
  if (!previous) return;

  const state = await previous.getState();
  if (state === 'completed' || state === 'failed') await previous.remove();
}

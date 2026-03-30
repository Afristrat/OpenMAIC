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

import { Queue } from 'bullmq';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Parse a redis:// URL into the IORedis-compatible connection object that
 * BullMQ expects. Falls back to localhost defaults when fields are missing.
 */
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
// Job type registry (for documentation / type narrowing)
// ---------------------------------------------------------------------------

export type JobType =
  | 'classroom-generation'
  | 'tts-batch'
  | 'email-notification'
  | 'xapi-statement'
  | 'pedagogy-collect';

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export const classroomQueue = new Queue('classroom-generation', { connection });
export const ttsQueue = new Queue('tts-batch', { connection });
export const notificationQueue = new Queue('notifications', { connection });
export const telemetryQueue = new Queue('telemetry', { connection });

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueClassroomGeneration(data: {
  requirements: unknown;
  userId: string;
  stageId: string;
}): Promise<string> {
  const job = await classroomQueue.add('generate', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  return job.id!;
}

export async function enqueueTTSBatch(data: {
  actions: Array<{ id: string; text: string; voice: string }>;
  stageId: string;
}): Promise<string> {
  const job = await ttsQueue.add('batch', data);
  return job.id!;
}

export async function enqueueNotification(data: {
  userId: string;
  type: 'review-reminder' | 'course-complete' | 'certificate-ready';
  channels: ('email' | 'push' | 'whatsapp')[];
}): Promise<void> {
  await notificationQueue.add('send', data);
}

export async function enqueueTelemetry(data: {
  type: 'pedagogy' | 'discussion' | 'xapi';
  payload: unknown;
}): Promise<void> {
  await telemetryQueue.add('collect', data, { removeOnComplete: true });
}

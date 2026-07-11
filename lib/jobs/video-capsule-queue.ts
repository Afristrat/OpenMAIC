/**
 * BullMQ queue for video capsule rendering (Mishkāt/Hyperframes, S1-006).
 *
 * Kept in its own file rather than extending `lib/jobs/queue.ts`: that file
 * is listed in `refork/audit-provenance.json` under `agpl_only_heritage`
 * (purge en attente, ADR-002 / S0-014) and must not be modified until Amine
 * tranche. Connection helper duplicated from `queue.ts` (same pattern
 * already duplicated there vs. `workers.ts` in the original codebase).
 */

import { Queue } from 'bullmq';

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

export const videoCapsuleQueue = new Queue('video-capsule', { connection });

export async function enqueueVideoCapsule(data: { capsuleId: string }): Promise<string> {
  const job = await videoCapsuleQueue.add('render', data, { attempts: 1 });
  if (!job.id) {
    throw new Error('BullMQ did not assign a job id to the video-capsule job');
  }
  return job.id;
}

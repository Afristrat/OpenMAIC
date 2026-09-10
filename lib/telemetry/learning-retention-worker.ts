import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import {
  purgeOrphanedManagedVideos,
  purgeOrphanedCourseImports,
} from '@/lib/server/managed-video-cleanup';
import { reconcileFailedManagedVideos } from '@/lib/server/managed-video-reconciliation';

const log = createLogger('LearningRetention');

export async function purgeExpiredLearningObservations(): Promise<number> {
  return purgeBatch('purge_expired_learning_observations');
}

export async function purgeDetachedPersonalAgents(): Promise<number> {
  return purgeBatch('purge_detached_personal_agents');
}

async function purgeBatch(
  procedure: 'purge_expired_learning_observations' | 'purge_detached_personal_agents',
): Promise<number> {
  const result = await createServiceSupabaseClient()
    .rpc(procedure)
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error || !Number.isInteger(result.data) || result.data < 0 || result.data > 1000) {
    throw new Error('Learning retention batch failed');
  }
  return result.data;
}

/** Same lifecycle as the existing LTI worker; SQL locks coordinate replicas. */
export function startLearningRetentionWorker(): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      try {
        await reconcileFailedManagedVideos();
      } catch {
        log.error('Video reconciliation failed; retry on the next hourly cycle');
      }
      for (const [purge, batchSize] of [
        [purgeExpiredLearningObservations, 1000],
        [purgeDetachedPersonalAgents, 1000],
        [purgeOrphanedManagedVideos, 100],
        [purgeOrphanedCourseImports, 100],
      ] as const) {
        try {
          // ponytail: ten batches/hour/task/worker; increase cadence if monitored backlog grows.
          for (let batch = 0; batch < 10 && !stopped; batch++) {
            if ((await purge()) < batchSize) break;
          }
        } catch {
          // Keep independent cleanup queues progressing when one RPC fails.
          log.error(`Retention task ${purge.name} failed; retry on the next hourly cycle`);
        }
      }
    })().finally(() => {
      running = undefined;
    });
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}

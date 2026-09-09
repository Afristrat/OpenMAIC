import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearningRetention');

export async function purgeExpiredLearningObservations(): Promise<number> {
  const result = await createServiceSupabaseClient()
    .rpc('purge_expired_learning_observations')
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
        // ponytail: 10,000 rows/hour/worker; increase cadence if monitored backlog grows.
        for (let batch = 0; batch < 10 && !stopped; batch++) {
          if ((await purgeExpiredLearningObservations()) < 1000) break;
        }
      } catch {
        log.error('Learning retention failed; retry on the next hourly cycle');
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

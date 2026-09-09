import { z } from 'zod';
import { getJobQueues } from '@/lib/jobs/queue';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/** Reconcile proven failures, never infer failure from age or a missing Redis job. */
export async function reconcileFailedManagedVideos(): Promise<void> {
  // ponytail: scan the queue's 500 retained failures; revisit if its retention cap increases.
  const failures = await getJobQueues().videoGeneration.getFailed(0, 499);
  const ids = new Set<string>();
  for (const job of failures) {
    const payload = z.object({ videoGenerationJobId: z.string().uuid() }).safeParse(job.data);
    if (job.name !== 'generate' || !payload.success) continue;
    if ((await job.getState()) === 'failed') ids.add(payload.data.videoGenerationJobId);
  }
  if (!ids.size) return;
  // The worker's conditional claim forbids replay of a started DB job. A late
  // provider response must recheck this status; no file or provider call is touched here.
  const result = await createServiceSupabaseClient()
    .from('video_generation_jobs')
    .update({ status: 'error', error: 'Video generation interrupted; automatic replay refused' })
    .in('id', [...ids])
    .eq('status', 'generating')
    .select('id')
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error || !Array.isArray(result.data)) {
    throw new Error('Video failure reconciliation unavailable');
  }
}

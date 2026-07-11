/**
 * BullMQ worker for video capsule rendering (Mishkāt/Hyperframes, S1-006).
 *
 * Kept in its own file rather than extending `lib/jobs/workers.ts`: that
 * file is listed in `refork/audit-provenance.json` under
 * `agpl_only_heritage` (purge en attente, ADR-002 / S0-014) and must not be
 * modified until Amine tranche. Not auto-started anywhere yet — same state
 * as the rest of the BullMQ worker system in this codebase (no worker
 * entry-point process currently invokes `startAllWorkers()` either).
 */

import { Worker, type Job } from 'bullmq';
import { createLogger } from '@/lib/logger';
import { isFeatureEnabled } from '@/lib/flags';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createHyperframesProduction, getHyperframesProduction } from '@/lib/video/hyperframes-client';
import type { HyperframesBrief, HyperframesProductionStatus } from '@/lib/video/hyperframes-types';

const log = createLogger('VideoCapsuleWorker');

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

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 90; // ~7.5 min ceiling for a single capsule render

let worker: Worker | null = null;

async function processVideoCapsuleJob(job: Job): Promise<void> {
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

    let lastStatus: HyperframesProductionStatus = 'generating';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const production = await getHyperframesProduction(productionId);

      if (production.status !== lastStatus) {
        lastStatus = production.status;
        await supabase.from('video_capsules').update({ status: lastStatus }).eq('id', capsuleId);
      }

      if (production.status === 'done') {
        await supabase
          .from('video_capsules')
          .update({ status: 'done', variants: production.variants ?? [] })
          .eq('id', capsuleId);
        return;
      }

      if (production.status === 'error') {
        await supabase
          .from('video_capsules')
          .update({ status: 'error', error: production.error ?? 'Mishkāt production error' })
          .eq('id', capsuleId);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    await supabase
      .from('video_capsules')
      .update({ status: 'error', error: 'Timed out waiting for Mishkāt production' })
      .eq('id', capsuleId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('video_capsules').update({ status: 'error', error: message }).eq('id', capsuleId);
    throw err;
  }
}

/** Starts the video-capsule BullMQ worker. Safe to call multiple times — subsequent calls are no-ops. */
export function startVideoCapsuleWorker(): void {
  if (worker) return;
  worker = new Worker('video-capsule', processVideoCapsuleJob, { connection, concurrency: 2 });
  worker.on('failed', (job, err) => {
    log.error(`Job ${job?.id} failed in video-capsule:`, err.message);
  });
  log.info('Started video-capsule BullMQ worker');
}

export async function stopVideoCapsuleWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('SyncQueue');

/**
 * Queued operation for offline sync.
 * Stored in IndexedDB `syncQueue` table and processed when connectivity returns.
 */
export interface QueuedOperation {
  id: string;
  type: 'quiz_result' | 'review_rating' | 'stage_sync';
  payload: unknown;
  createdAt: number;
  retries: number;
}

/**
 * Endpoint mapping for each operation type.
 */
const ENDPOINT_MAP: Record<QueuedOperation['type'], string> = {
  quiz_result: '/api/quiz/results',
  review_rating: '/api/review/ratings',
  stage_sync: '/api/stages/sync',
};

/**
 * Enqueue an operation for later sync.
 * Immediately attempts a Background Sync registration if available.
 */
export async function enqueueOperation(
  op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retries'>,
): Promise<void> {
  const entry: QueuedOperation = {
    id: `${op.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: op.type,
    payload: op.payload,
    createdAt: Date.now(),
    retries: 0,
  };

  await db.syncQueue.put(entry);
  log.info(`Enqueued operation: ${entry.id} (type=${entry.type})`);

  // Request background sync if supported
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('qalem-sync-queue');
    } catch {
      log.warn('Background sync registration failed — will retry on reconnect');
    }
  }
}

/**
 * Process all queued operations (called when connectivity returns).
 * Returns counts of processed and failed operations.
 */
export async function processQueue(): Promise<{ processed: number; failed: number }> {
  const items = await db.syncQueue.toArray();

  if (items.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    const endpoint = ENDPOINT_MAP[item.type];
    if (!endpoint) {
      log.warn(`Unknown operation type: ${item.type}, removing from queue`);
      await db.syncQueue.delete(item.id);
      failed++;
      continue;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });

      if (response.ok) {
        await db.syncQueue.delete(item.id);
        processed++;
        log.info(`Synced operation: ${item.id}`);
      } else if (item.retries >= 3) {
        // Max retries reached — drop the operation
        await db.syncQueue.delete(item.id);
        failed++;
        log.warn(`Dropped operation after max retries: ${item.id}`);
      } else {
        // Increment retry counter
        await db.syncQueue.put({ ...item, retries: item.retries + 1 });
        failed++;
      }
    } catch {
      // Network still unavailable — leave in queue
      failed++;
    }
  }

  log.info(`Sync complete: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}

/**
 * Get the number of pending operations in the sync queue.
 */
export async function getQueueSize(): Promise<number> {
  return db.syncQueue.count();
}

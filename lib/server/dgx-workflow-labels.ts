import { listDgxTxt2ImgModelLabels } from '@/lib/media/adapters/dgx-image-adapter';
import { createLogger } from '@/lib/logger';
import {
  getServerImageProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
} from '@/lib/server/provider-config';

const log = createLogger('DgxWorkflowLabels');
const CACHE_TTL_MS = 5 * 60_000;
const FAILURE_RETRY_MS = 30_000;

let cache: { labels: Record<string, string>; expiresAt: number } | null = null;

/**
 * Model names reported by the DGX Studio sidecar itself, so the media menu never
 * relies on a hand-typed label. Cached; a sidecar outage keeps the last known
 * names (or none) and retries shortly, it never breaks the provider listing.
 */
export async function getDgxWorkflowLabels(): Promise<Record<string, string>> {
  if (!('dgx' in getServerImageProviders())) return {};
  if (cache && Date.now() < cache.expiresAt) return cache.labels;

  try {
    const labels = await listDgxTxt2ImgModelLabels({
      apiKey: resolveImageApiKey('dgx'),
      baseUrl: resolveImageBaseUrl('dgx'),
    });
    cache = { labels, expiresAt: Date.now() + CACHE_TTL_MS };
  } catch (error) {
    log.warn('DGX workflow catalogue unavailable:', error instanceof Error ? error.message : error);
    cache = { labels: cache?.labels ?? {}, expiresAt: Date.now() + FAILURE_RETRY_MS };
  }
  return cache.labels;
}

/** Test seam: forget the cached catalogue. */
export function resetDgxWorkflowLabelsCache(): void {
  cache = null;
}

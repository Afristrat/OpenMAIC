import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Maps a hostname to a Playwright storageState JSON file path. Populated
 * manually: Amine runs `npx playwright open --save-storage=<path> <url>`
 * once per external tool, logs in by hand, then registers the resulting
 * path here. Never written to by any automated code path.
 */
const STORAGE_STATE_DIR = process.env.CAPTURE_STORAGE_STATE_DIR || '/data/storage-states';

const REGISTRY: Record<string, string> = {
  'proxy.ai-mpower.com': 'proxy-ai-mpower-com.json',
};

export function resolveStorageStatePath(url: string): string | undefined {
  const hostname = new URL(url).hostname;
  const filename = REGISTRY[hostname];
  if (!filename) return undefined;
  const fullPath = path.join(STORAGE_STATE_DIR, filename);
  return existsSync(fullPath) ? fullPath : undefined;
}

/** Exposed for tests only. */
export function _readStorageStateRaw(fullPath: string): string {
  return readFileSync(fullPath, 'utf-8');
}

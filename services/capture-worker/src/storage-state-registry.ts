import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves a hostname to its Playwright storageState JSON file, by naming
 * convention (dots -> dashes), so registering a new site is a pure ops
 * action: Amine runs `npx playwright open --save-storage=<dir>/<host-with-dashes>.json <url>`,
 * logs in by hand, drops the file in the volume. No code change, no redeploy.
 */
function storageStateFilename(hostname: string): string {
  return `${hostname.replace(/\./g, '-')}.json`;
}

export function resolveStorageStatePath(url: string): string | undefined {
  const storageStateDir = process.env.CAPTURE_STORAGE_STATE_DIR || '/data/storage-states';
  const hostname = new URL(url).hostname;
  const fullPath = path.join(storageStateDir, storageStateFilename(hostname));
  return existsSync(fullPath) ? fullPath : undefined;
}

/** Exposed for tests only. */
export function _readStorageStateRaw(fullPath: string): string {
  return readFileSync(fullPath, 'utf-8');
}

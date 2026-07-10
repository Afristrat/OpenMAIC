/**
 * TTS Audio Cache (Server-Only)
 *
 * Filesystem-backed cache that sits between TTS provider calls and callers.
 * Cache key = SHA-256 hash of (voice + text + speed).
 *
 * Storage: data/tts-cache/{hash}.{format}
 *
 * IMPORTANT: This module uses Node.js `crypto` and `fs` — it MUST only be
 * imported in server-side code (API routes, workers). Never import from
 * client components.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(process.cwd(), 'data', 'tts-cache');

/** Ensure the cache directory exists (created lazily on first write). */
let dirEnsured = false;
async function ensureCacheDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(CACHE_DIR, { recursive: true });
  dirEnsured = true;
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function getCacheKey(voice: string, text: string, speed: number): string {
  return crypto
    .createHash('sha256')
    .update(`${voice}:${text}:${speed}`)
    .digest('hex');
}

function getCachePath(voice: string, text: string, speed: number, format: string): string {
  const hash = getCacheKey(voice, text, speed);
  return path.join(CACHE_DIR, `${hash}.${format}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a cached audio file. Returns the raw bytes if found, null otherwise.
 */
export async function getCachedAudio(
  voice: string,
  text: string,
  speed: number,
  format: string = 'mp3',
): Promise<Uint8Array | null> {
  const filePath = getCachePath(voice, text, speed, format);
  try {
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  } catch {
    // File does not exist or is unreadable — cache miss
    return null;
  }
}

/**
 * Store generated audio in the filesystem cache.
 */
export async function cacheAudio(
  voice: string,
  text: string,
  speed: number,
  audio: Uint8Array,
  format: string,
): Promise<void> {
  await ensureCacheDir();
  const filePath = getCachePath(voice, text, speed, format);
  await fs.writeFile(filePath, audio);
}

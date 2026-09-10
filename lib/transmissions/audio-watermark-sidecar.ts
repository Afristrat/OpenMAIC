import { z } from 'zod/v4';
import { encodeAudioWatermarkMessages } from './audio-watermark-protocol';

const MAX_SOURCE_BYTES = 150 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

const sidecarUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
});

/**
 * Produces an MP3 derivative through the isolated AudioSeal process.
 * The feature flag is the activation boundary; missing configuration fails
 * closed so a worker can never silently claim a locally generated watermark.
 */
export async function applyAudioSealWatermark(
  source: Buffer,
  watermarkId: string,
): Promise<Buffer> {
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) {
    throw new Error('Audio watermark source size is invalid');
  }
  const baseUrl = sidecarUrl.safeParse(process.env.QALEM_AUDIOSEAL_URL);
  const token = process.env.QALEM_AUDIOSEAL_TOKEN;
  if (!baseUrl.success || !token) throw new Error('AudioSeal sidecar is not configured');

  const body = new FormData();
  body.set('source', new Blob([Uint8Array.from(source)], { type: 'video/mp4' }), 'source.mp4');
  body.set('messages', JSON.stringify(encodeAudioWatermarkMessages(watermarkId)));
  const response = await fetch(new URL('/v1/watermark', baseUrl.data), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    throw new Error('AudioSeal sidecar is unavailable');
  });
  if (
    !response.ok ||
    response.headers.get('content-type') !== 'audio/mpeg' ||
    response.headers.get('x-qalem-audioseal-model') !== 'audioseal_wm_16bits' ||
    response.headers.get('x-qalem-audioseal-segments') !== '11'
  ) {
    throw new Error('AudioSeal sidecar rejected or produced an invalid watermark');
  }
  const result = Buffer.from(await response.arrayBuffer());
  if (result.length === 0 || result.length > MAX_SOURCE_BYTES) {
    throw new Error('AudioSeal sidecar produced an invalid audio artifact');
  }
  return result;
}

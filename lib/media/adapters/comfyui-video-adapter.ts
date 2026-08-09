import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

interface LtxJobResponse {
  jobId?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'expired';
  error?: string;
}

const HEALTH_PATH = '/health/ltx2';
const WORKFLOW_PATH = '/workflow/ltx2/txt2video/async';
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 2_000;

const DIMENSIONS = {
  '16:9': { width: 768, height: 432 },
  '4:3': { width: 640, height: 480 },
  '1:1': { width: 512, height: 512 },
  '9:16': { width: 432, height: 768 },
  '3:4': { width: 480, height: 640 },
  '21:9': { width: 896, height: 384 },
} as const;

function authHeaders(secret: string): Record<string, string> {
  if (!secret) throw new Error('Qalem LTX-2 sidecar secret is required');
  return { 'X-Qalem-Video-Secret': secret };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function testComfyUIVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) return { success: false, message: 'ComfyUI sidecar base URL is required' };
  try {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      headers: authHeaders(config.apiKey),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok
      ? { success: true, message: 'ComfyUI sidecar is reachable' }
      : { success: false, message: `ComfyUI sidecar returned HTTP ${response.status}` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function generateWithComfyUIVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const baseUrl = config.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('ComfyUI sidecar base URL is required');
  const headers = authHeaders(config.apiKey);

  const dimensions = DIMENSIONS[options.aspectRatio ?? '16:9'];
  const duration = options.duration ?? 2;
  const fps = 24;
  const numFrames = Math.max(49, Math.min(257, Math.round((duration * fps - 1) / 8) * 8 + 1));
  const response = await fetch(`${baseUrl}${WORKFLOW_PATH}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        prompt: options.prompt,
        width: dimensions.width,
        height: dimensions.height,
        num_frames: numFrames,
        fps,
        steps: 15,
      },
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  const payload = (await response.json()) as LtxJobResponse;
  if (response.status === 429) {
    throw new Error('LTX-2 service is busy; no new job was submitted');
  }
  if (!response.ok) {
    throw new Error(payload.error || `ComfyUI LTX workflow failed with HTTP ${response.status}`);
  }
  if (response.status !== 202 || !payload.jobId) {
    throw new Error('ComfyUI LTX workflow did not return a job ID');
  }

  const jobId = encodeURIComponent(payload.jobId);
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${baseUrl}/video-jobs/${jobId}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const status = (await statusResponse.json()) as LtxJobResponse;
    if (!statusResponse.ok) {
      throw new Error(status.error || `LTX-2 job status failed with HTTP ${statusResponse.status}`);
    }
    if (status.status === 'failed' || status.status === 'expired') {
      throw new Error(status.error || `LTX-2 job ${status.status}`);
    }
    if (status.status === 'completed') {
      const resultResponse = await fetch(`${baseUrl}/video-jobs/${jobId}/result`, {
        headers,
        signal: AbortSignal.timeout(120_000),
      });
      if (!resultResponse.ok) {
        throw new Error(`LTX-2 result download failed with HTTP ${resultResponse.status}`);
      }
      const contentType = resultResponse.headers.get('content-type') || 'video/mp4';
      const encodedVideo = encodeBase64(await resultResponse.arrayBuffer());
      return {
        url: `data:${contentType};base64,${encodedVideo}`,
        width: dimensions.width,
        height: dimensions.height,
        duration: numFrames / fps,
      };
    }
    if (status.status !== 'queued' && status.status !== 'running') {
      throw new Error('LTX-2 job returned an unknown status');
    }
    await wait(POLL_INTERVAL_MS);
  }

  throw new Error('LTX-2 generation timed out');
}

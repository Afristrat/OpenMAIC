import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';

interface ComfyUIWorkflowResponse {
  images?: string[];
  filenames?: string[];
  error?: string;
}

const WORKFLOW_PATH = '/workflow/ltx2/txt2video';
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

const DIMENSIONS = {
  '16:9': { width: 768, height: 432 },
  '4:3': { width: 640, height: 480 },
  '1:1': { width: 512, height: 512 },
  '9:16': { width: 432, height: 768 },
  '3:4': { width: 480, height: 640 },
  '21:9': { width: 896, height: 384 },
} as const;

function mediaType(filename: string | undefined): string {
  const extension = filename?.split('.').pop()?.toLowerCase();
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mkv') return 'video/x-matroska';
  if (extension === 'mov') return 'video/quicktime';
  return 'video/mp4';
}

export async function testComfyUIVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = config.baseUrl?.replace(/\/$/, '');
  if (!baseUrl) return { success: false, message: 'ComfyUI sidecar base URL is required' };
  try {
    const response = await fetch(`${baseUrl}/health`, {
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

  const dimensions = DIMENSIONS[options.aspectRatio ?? '16:9'];
  const duration = options.duration ?? 2;
  const fps = 24;
  const numFrames = Math.max(49, Math.min(257, Math.round((duration * fps - 1) / 8) * 8 + 1));
  const response = await fetch(`${baseUrl}${WORKFLOW_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const payload = (await response.json()) as ComfyUIWorkflowResponse;
  if (!response.ok) {
    throw new Error(payload.error || `ComfyUI LTX workflow failed with HTTP ${response.status}`);
  }
  const encodedVideo = payload.images?.[0];
  if (!encodedVideo) throw new Error('ComfyUI LTX workflow returned no video');
  const filename = payload.filenames?.[0];
  return {
    url: `data:${mediaType(filename)};base64,${encodedVideo}`,
    width: dimensions.width,
    height: dimensions.height,
    duration: numFrames / fps,
  };
}

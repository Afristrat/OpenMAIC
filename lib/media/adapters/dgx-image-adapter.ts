/**
 * Qalem's authenticated DGX Studio image adapter.
 *
 * The sidecar contract is asynchronous: submit a workflow, poll its job, then
 * retrieve the completed PNG. The sidecar credential is server-only.
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

const DEFAULT_MODEL = 'flux-schnell';
const MAX_EDGE = 768;
const REQUEST_TIMEOUT_MS = 10_000;
const JOB_TIMEOUT_MS = 55_000;
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 2_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl?.trim()) throw new Error('DGX image sidecar URL is not configured');
  return baseUrl.trim().replace(/\/+$/, '');
}

function headers(apiKey: string, json = false): HeadersInit {
  return {
    Accept: 'application/json',
    'X-Tamkin-Studio-Secret': apiKey,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function outputSize(options: ImageGenerationOptions): { width: number; height: number } {
  let width = options.width;
  let height = options.height;
  if (!width || !height) {
    const [ratioWidth, ratioHeight] = (options.aspectRatio || '1:1').split(':').map(Number);
    const ratio = ratioWidth / ratioHeight;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new Error('DGX image generation received an invalid aspect ratio');
    }
    if (ratio >= 1) {
      width = MAX_EDGE;
      height = Math.max(1, Math.round(MAX_EDGE / ratio));
    } else {
      height = MAX_EDGE;
      width = Math.max(1, Math.round(MAX_EDGE * ratio));
    }
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('DGX image dimensions must be positive integers');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function responseError(response: Response, operation: string): Promise<Error> {
  const detail = (await response.text().catch(() => response.statusText)).slice(0, 500);
  return new Error(`DGX image ${operation} failed (${response.status}): ${detail}`);
}

async function jsonResponse(
  response: Response,
  operation: string,
): Promise<Record<string, unknown>> {
  if (!response.ok) throw await responseError(response, operation);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`DGX image ${operation} returned an invalid response`);
  }
  return payload as Record<string, unknown>;
}

export async function testDgxImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey.trim()) {
    return { success: false, message: 'DGX image sidecar secret is not configured' };
  }

  try {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const healthResponse = await fetch(`${baseUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const health = await jsonResponse(healthResponse, 'health check');
    if (health.status !== 'healthy') {
      return { success: false, message: 'DGX image sidecar is reachable but not healthy' };
    }

    // A random missing job must return 404 only after the sidecar accepts the
    // credential. This verifies authentication without waking the GPU.
    const authResponse = await fetch(`${baseUrl}/jobs/${globalThis.crypto.randomUUID()}`, {
      headers: headers(config.apiKey),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (authResponse.status !== 404) {
      if (authResponse.status === 401 || authResponse.status === 403) {
        return { success: false, message: 'DGX image sidecar rejected its configured secret' };
      }
      return {
        success: false,
        message: `DGX image sidecar authentication probe returned HTTP ${authResponse.status}`,
      };
    }
    const authPayload: unknown = await authResponse.json().catch(() => null);
    if (
      !authPayload ||
      typeof authPayload !== 'object' ||
      !('error' in authPayload) ||
      authPayload.error !== 'job not found'
    ) {
      return {
        success: false,
        message: 'DGX image sidecar returned an invalid authentication probe',
      };
    }
    return { success: true, message: 'DGX image sidecar and authentication are available' };
  } catch (error) {
    return {
      success: false,
      message: `DGX image sidecar connectivity error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function generateWithDgxImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error('DGX image sidecar secret is not configured');
  if (!options.prompt.trim()) throw new Error('DGX image prompt must not be empty');
  const model = config.model || DEFAULT_MODEL;
  if (model !== DEFAULT_MODEL) throw new Error(`Unsupported DGX image workflow: ${model}`);

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const { width, height } = outputSize(options);
  const submitResponse = await fetch(`${baseUrl}/workflow/${DEFAULT_MODEL}/txt2img/async`, {
    method: 'POST',
    headers: headers(apiKey, true),
    body: JSON.stringify({ prompt: options.prompt, size: `${width}x${height}` }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const submitted = await jsonResponse(submitResponse, 'submission');
  if (submitResponse.status !== 202 || typeof submitted.jobId !== 'string') {
    throw new Error('DGX image submission returned no asynchronous job identifier');
  }
  const jobId = submitted.jobId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('DGX image submission returned an invalid job identifier');
  }

  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let interval = INITIAL_POLL_INTERVAL_MS;
  while (true) {
    const jobResponse = await fetch(`${baseUrl}/jobs/${jobId}`, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const job = await jsonResponse(jobResponse, 'job polling');
    if (job.status === 'failed' || job.status === 'expired') {
      throw new Error(`DGX image job ${job.status}`);
    }
    if (job.status === 'completed') break;
    if (job.status !== 'queued' && job.status !== 'running') {
      throw new Error('DGX image job returned an unsupported state');
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('DGX image job exceeded the 55-second generation limit');
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, remaining)));
    interval = Math.min(interval * 2, MAX_POLL_INTERVAL_MS);
  }

  const resultResponse = await fetch(`${baseUrl}/jobs/${jobId}/result`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const resultPayload = await jsonResponse(resultResponse, 'result retrieval');
  const firstImage = Array.isArray(resultPayload.data) ? resultPayload.data[0] : undefined;
  const encoded =
    firstImage && typeof firstImage === 'object' && 'b64_json' in firstImage
      ? firstImage.b64_json
      : undefined;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('DGX image result did not contain valid base64 image data');
  }
  let imageBytes: string;
  try {
    imageBytes = atob(encoded);
  } catch {
    throw new Error('DGX image result did not contain valid base64 image data');
  }
  if (
    imageBytes.length <= PNG_SIGNATURE.length ||
    !PNG_SIGNATURE.every((byte, index) => imageBytes.charCodeAt(index) === byte)
  ) {
    throw new Error('DGX image result is not a valid PNG');
  }

  return { base64: encoded, width, height };
}

/**
 * Image Generation API
 *
 * Generates an image from a text prompt using the specified provider.
 * Called by the client during media generation after slides are produced.
 *
 * POST /api/generate/image
 *
 * Headers:
 *   x-image-provider: ImageProviderId (default: 'seedream')
 *   x-api-key: string (optional, server fallback)
 *   x-base-url: string (optional, server fallback)
 *
 * Body: { prompt, negativePrompt?, width?, height?, aspectRatio?, style? }
 * Response: { success: boolean, result?: ImageGenerationResult, error?: string }
 */

import { NextRequest } from 'next/server';
import {
  generateImage,
  aspectRatioToDimensions,
  IMAGE_PROVIDERS,
} from '@/lib/media/image-providers';
import {
  isServerConfiguredProvider,
  resolveImageApiKey,
  resolveImageBaseUrl,
} from '@/lib/server/provider-config';
import type { ImageProviderId, ImageGenerationOptions } from '@/lib/media/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { randomUUID } from 'node:crypto';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { uploadClassroomMedia } from '@/lib/server/classroom-media-generation';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';

const log = createLogger('ImageGeneration API');

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const requestBody = (await request.json()) as ImageGenerationOptions & { classroomId?: string };
    const { classroomId, ...body } = requestBody;

    if (!body.prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing prompt');
    }

    if (classroomId) {
      if (!isValidClassroomId(classroomId)) {
        return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
      }
      const ownership = await readClassroomOwnership(classroomId);
      if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom not found');
      const auth = await requireSuperAdminOrOrgEditor(
        request,
        ownership.orgId,
        ownership.ownerId,
      );
      if (auth.response) return auth.response;
    }

    const providerId = (request.headers.get('x-image-provider') || 'seedream') as ImageProviderId;
    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('image', providerId);
    const clientApiKey = managed ? undefined : request.headers.get('x-api-key') || undefined;
    const clientBaseUrl = managed ? undefined : request.headers.get('x-base-url') || undefined;
    const clientModel = request.headers.get('x-image-model') || undefined;

    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const apiKey = resolveImageApiKey(providerId, clientApiKey);
    const provider = IMAGE_PROVIDERS[providerId];
    if (provider?.requiresApiKey && !apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        `No API key configured for image provider: ${providerId}`,
      );
    }

    const baseUrl = resolveImageBaseUrl(providerId, clientBaseUrl);

    // Resolve dimensions from aspect ratio if not explicitly set
    if (!body.width && !body.height && body.aspectRatio) {
      const dims = aspectRatioToDimensions(body.aspectRatio);
      body.width = dims.width;
      body.height = dims.height;
    }

    log.info(
      `Generating image: provider=${providerId}, model=${clientModel || 'default'}, ` +
        `prompt="${body.prompt.slice(0, 80)}...", size=${body.width ?? 'auto'}x${body.height ?? 'auto'}`,
    );

    const result = await generateImage({ providerId, apiKey, baseUrl, model: clientModel }, body);

    if (classroomId) {
      const bytes = result.base64
        ? Buffer.from(result.base64, 'base64')
        : result.url
          ? Buffer.from(
              await (
                await fetch(result.url, { signal: AbortSignal.timeout(60_000) })
              ).arrayBuffer(),
            )
          : null;
      if (!bytes?.length) {
        return apiError('GENERATION_FAILED', 502, 'Image generation returned no media');
      }
      const filename = `editor-${randomUUID()}.png`;
      await uploadClassroomMedia(classroomId, `media/${filename}`, bytes);
      result.url = `/api/classroom-media/${classroomId}/media/${filename}`;
      result.base64 = undefined;
    }

    return apiSuccess({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Detect content safety filter rejections (e.g. Seedream OutputImageSensitiveContentDetected)
    if (message.includes('SensitiveContent') || message.includes('sensitive information')) {
      log.warn(`Image blocked by content safety filter: ${message}`);
      return apiError('CONTENT_SENSITIVE', 400, message);
    }
    log.error(
      `Image generation failed [provider=${request.headers.get('x-image-provider') ?? 'seedream'}, model=${request.headers.get('x-image-model') ?? 'default'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, message);
  }
}

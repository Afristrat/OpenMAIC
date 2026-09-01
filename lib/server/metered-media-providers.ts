import { generateImage, IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { generateVideo, VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '@/lib/media/types';
import { runMeteredTenantUsage } from '@/lib/billing/usage-metering';

export function generateMeteredImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return runMeteredTenantUsage({
    source: 'image',
    billableUnit: 'image',
    maxQuantity: 1,
    providerId: config.providerId,
    modelId: config.model || IMAGE_PROVIDERS[config.providerId]?.models[0]?.id || 'default',
    execute: () => generateImage(config, options),
    measureActualQuantity: () => 1,
  });
}

export function generateMeteredVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const provider = VIDEO_PROVIDERS[config.providerId];
  return runMeteredTenantUsage({
    source: 'video',
    billableUnit: 'video_second',
    maxQuantity:
      provider?.maxDuration ??
      Math.max(...(provider?.supportedDurations ?? [options.duration ?? 1])),
    providerId: config.providerId,
    modelId: config.model || provider?.models[0]?.id || 'default',
    execute: () => generateVideo(config, options),
    measureActualQuantity: (result) => result.duration,
  });
}

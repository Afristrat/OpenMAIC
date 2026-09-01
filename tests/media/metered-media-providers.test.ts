import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
  runMeteredTenantUsage: vi.fn(),
}));

vi.mock('@/lib/media/image-providers', () => ({
  IMAGE_PROVIDERS: { image: { models: [{ id: 'image-default' }] } },
  generateImage: mocks.generateImage,
}));

vi.mock('@/lib/media/video-providers', () => ({
  VIDEO_PROVIDERS: {
    video: { models: [{ id: 'video-default' }], maxDuration: 10 },
  },
  generateVideo: mocks.generateVideo,
}));

vi.mock('@/lib/billing/usage-metering', () => ({
  runMeteredTenantUsage: mocks.runMeteredTenantUsage,
}));

import { generateMeteredImage, generateMeteredVideo } from '@/lib/server/metered-media-providers';

describe('server-only metered media providers (S6-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runMeteredTenantUsage.mockImplementation(async (input) => input.execute());
  });

  it('meters one generated image before delegating to the isomorphic adapter', async () => {
    mocks.generateImage.mockResolvedValue({ url: 'image' });
    await generateMeteredImage({ providerId: 'image', model: 'image-model' } as never, {
      prompt: 'prompt',
    });

    expect(mocks.runMeteredTenantUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'image',
        billableUnit: 'image',
        maxQuantity: 1,
        modelId: 'image-model',
      }),
    );
    expect(mocks.generateImage).toHaveBeenCalledOnce();
  });

  it('reserves the provider maximum and measures the returned video duration', async () => {
    mocks.generateVideo.mockResolvedValue({ url: 'video', duration: 4 });
    await generateMeteredVideo({ providerId: 'video' } as never, { prompt: 'prompt', duration: 4 });
    const metering = mocks.runMeteredTenantUsage.mock.calls[0][0];

    expect(metering).toEqual(
      expect.objectContaining({
        source: 'video',
        billableUnit: 'video_second',
        maxQuantity: 10,
        modelId: 'video-default',
      }),
    );
    expect(metering.measureActualQuantity({ duration: 4 })).toBe(4);
  });
});

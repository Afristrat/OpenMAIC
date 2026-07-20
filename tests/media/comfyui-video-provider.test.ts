import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWithComfyUIVideo } from '@/lib/media/adapters/comfyui-video-adapter';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';

describe('ComfyUI LTX video provider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is exposed as a keyless video provider despite the LiteLLM image tag', () => {
    expect(VIDEO_PROVIDERS['comfyui-video']).toMatchObject({
      requiresApiKey: false,
      models: [{ id: 'ltx-2-video' }],
    });
  });

  it('calls the native LTX workflow and returns a typed data URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ images: ['AAAA'], filenames: ['ltx2.mp4'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const result = await generateWithComfyUIVideo(
      { providerId: 'comfyui-video', apiKey: '', baseUrl: 'http://comfy.test' },
      { prompt: 'A pedagogical animation', duration: 2, aspectRatio: '16:9' },
    );
    expect(result.url).toBe('data:video/mp4;base64,AAAA');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://comfy.test/workflow/ltx2/txt2video',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

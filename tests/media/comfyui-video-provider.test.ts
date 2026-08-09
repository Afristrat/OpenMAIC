import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateWithComfyUIVideo,
  testComfyUIVideoConnectivity,
} from '@/lib/media/adapters/comfyui-video-adapter';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';

describe('ComfyUI LTX video provider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is exposed as an authenticated video provider despite the LiteLLM image tag', () => {
    expect(VIDEO_PROVIDERS['comfyui-video']).toMatchObject({
      requiresApiKey: true,
      models: [{ id: 'ltx-2-video' }],
    });
  });

  it('checks the sidecar health endpoint without depending on its model schema', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      testComfyUIVideoConnectivity({
        providerId: 'comfyui-video',
        apiKey: 'sidecar-secret',
        baseUrl: 'http://comfy.test/',
      }),
    ).resolves.toEqual({ success: true, message: 'ComfyUI sidecar is reachable' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://comfy.test/health/ltx2',
      expect.objectContaining({
        headers: { 'X-Qalem-Video-Secret': 'sidecar-secret' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('submits one asynchronous job, polls it and returns the binary MP4', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-123' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'completed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        }),
      );
    const result = await generateWithComfyUIVideo(
      {
        providerId: 'comfyui-video',
        apiKey: 'sidecar-secret',
        baseUrl: 'http://comfy.test',
      },
      { prompt: 'A pedagogical animation', duration: 2, aspectRatio: '16:9' },
    );
    expect(result.url).toBe('data:video/mp4;base64,AAECAw==');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://comfy.test/workflow/ltx2/txt2video/async',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Qalem-Video-Secret': 'sidecar-secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://comfy.test/video-jobs/job-123',
      expect.objectContaining({ headers: { 'X-Qalem-Video-Secret': 'sidecar-secret' } }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://comfy.test/video-jobs/job-123/result',
      expect.objectContaining({ headers: { 'X-Qalem-Video-Secret': 'sidecar-secret' } }),
    );
  });

  it('does not resubmit when the service is occupied', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'busy' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      generateWithComfyUIVideo(
        {
          providerId: 'comfyui-video',
          apiKey: 'sidecar-secret',
          baseUrl: 'http://comfy.test',
        },
        { prompt: 'A pedagogical animation', duration: 2, aspectRatio: '16:9' },
      ),
    ).rejects.toThrow('service is busy; no new job was submitted');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

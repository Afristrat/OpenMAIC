import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { IMAGE_PROVIDERS, generateImage, testImageConnectivity } from '@/lib/media/image-providers';
import { listDgxTxt2ImgModelLabels } from '@/lib/media/adapters/dgx-image-adapter';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('image-data'),
]).toString('base64');

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('dgx-image-adapter', () => {
  beforeEach(() => mockFetch.mockReset());

  it('reads model names from the sidecar catalogue and keeps only async txt2img workflows', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        workflows: [
          {
            alias: 'default',
            model: 'FLUX.2 Klein 9B',
            route: '/workflow/default/txt2img/async',
            mode: 'async',
            availability: 'available',
          },
          {
            alias: 'kontext/edit',
            model: 'FLUX.1 Kontext dev',
            route: '/workflow/kontext/edit',
            mode: 'sync',
            availability: 'available',
          },
          {
            alias: 'offline',
            model: 'Unavailable model',
            route: '/workflow/offline/txt2img/async',
            mode: 'async',
            availability: 'unavailable',
          },
        ],
      }),
    );

    await expect(
      listDgxTxt2ImgModelLabels({ apiKey: 'sidecar-secret', baseUrl: 'http://dgx.internal:8189/' }),
    ).resolves.toEqual({ default: 'FLUX.2 Klein 9B' });
    expect(mockFetch.mock.calls[0][0]).toBe('http://dgx.internal:8189/workflows');
    expect(mockFetch.mock.calls[0][1].headers['X-Qalem-Studio-Secret']).toBe('sidecar-secret');
  });

  it('rejects a failing or malformed catalogue instead of inventing names', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403));
    await expect(
      listDgxTxt2ImgModelLabels({ apiKey: 'k', baseUrl: 'http://dgx.internal:8189' }),
    ).rejects.toThrow('403');
    mockFetch.mockResolvedValueOnce(jsonResponse({ workflows: 'nope' }));
    await expect(
      listDgxTxt2ImgModelLabels({ apiKey: 'k', baseUrl: 'http://dgx.internal:8189' }),
    ).rejects.toThrow('malformed');
  });

  it('submits, polls and retrieves an authenticated PNG without invoking ComfyUI directly', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed' }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: png }] }));

    const result = await generateImage(
      {
        providerId: 'dgx',
        apiKey: 'sidecar-secret',
        baseUrl: 'http://dgx.internal:8189/',
        model: 'studio-workflow',
      },
      { prompt: 'A learning illustration', aspectRatio: '16:9' },
    );

    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'http://dgx.internal:8189/workflow/studio-workflow/txt2img/async',
      'http://dgx.internal:8189/jobs/123e4567-e89b-42d3-a456-426614174000',
      'http://dgx.internal:8189/jobs/123e4567-e89b-42d3-a456-426614174000/result',
    ]);
    expect(
      mockFetch.mock.calls.every(
        ([, init]) => init.headers['X-Qalem-Studio-Secret'] === 'sidecar-secret',
      ),
    ).toBe(true);
    expect(mockFetch.mock.calls.some(([, init]) => 'X-Tamkin-Studio-Secret' in init.headers)).toBe(
      false,
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      prompt: 'A learning illustration',
      size: '768x432',
    });
    expect(result).toEqual({ base64: png, width: 768, height: 432 });
  });

  it('checks sidecar health and credential acceptance without submitting a GPU job', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'healthy' }))
      .mockResolvedValueOnce({ status: 404, json: async () => ({ error: 'job not found' }) });

    await expect(
      testImageConnectivity({ providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx' }),
    ).resolves.toEqual({
      success: true,
      message: 'DGX image sidecar and authentication are available',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('http://dgx/health');
    expect(mockFetch.mock.calls[1][0]).toMatch(/^http:\/\/dgx\/jobs\/[0-9a-f-]+$/);
  });

  it('does not submit a job when the sidecar secret is absent', async () => {
    await expect(
      generateImage({ providerId: 'dgx', apiKey: '' }, { prompt: 'test' }),
    ).rejects.toThrow('DGX image sidecar secret is not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a missing sidecar URL without attempting a request', async () => {
    await expect(
      testImageConnectivity({ providerId: 'dgx', apiKey: 'secret' }),
    ).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('URL is not configured'),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects unauthorized responses without leaking the configured secret', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'healthy' }))
      .mockResolvedValueOnce({ status: 401 });
    const result = await testImageConnectivity({
      providerId: 'dgx',
      apiKey: 'private',
      baseUrl: 'http://dgx',
    });
    expect(result).toEqual({
      success: false,
      message: 'DGX image sidecar rejected its configured secret',
    });
    expect(result.message).not.toContain('private');
  });

  it('requires an administered workflow and rejects unsafe identifiers without any request', async () => {
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('workflow is not configured');
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: '../kontext/edit' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('workflow identifier is invalid');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('waits and resubmits when the shared GPU queue answers 429, then gives up after three attempts', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: 'queue full' }, 429))
        .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
        .mockResolvedValueOnce(jsonResponse({ status: 'completed' }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: png }] }));
      const recovered = generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(recovered).resolves.toMatchObject({ base64: png });
      expect(mockFetch).toHaveBeenCalledTimes(4);

      mockFetch.mockReset();
      mockFetch.mockResolvedValue(jsonResponse({ error: 'queue full' }, 429));
      const saturated = generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      );
      const assertion = expect(saturated).rejects.toThrow('submission failed (429)');
      await vi.advanceTimersByTimeAsync(15_000 + 30_000);
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('polls a running job every 5 seconds instead of spinning', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
        .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'running' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'completed' }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: png }] }));
      const pending = generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      );
      await vi.advanceTimersByTimeAsync(4_999);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toMatchObject({ base64: png });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails explicitly when a job fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: 'failed' }));
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('DGX image job failed');
  });

  it('fails explicitly when the asynchronous sidecar job expires', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: 'expired' }));
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('DGX image job expired');
  });

  it('rejects malformed job identifiers and non-PNG results', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ jobId: '../other-route' }, 202));
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('invalid job identifier');

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ jobId: '123e4567-e89b-42d3-a456-426614174000' }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: 'completed' }))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ b64_json: Buffer.from('not-png').toString('base64') }] }),
      );
    await expect(
      generateImage(
        { providerId: 'dgx', apiKey: 'secret', baseUrl: 'http://dgx', model: 'studio-workflow' },
        { prompt: 'test' },
      ),
    ).rejects.toThrow('not a valid PNG');
  });

  it('registers the DGX workflow and caps its advertised resolution', () => {
    expect(IMAGE_PROVIDERS.dgx).toMatchObject({
      id: 'dgx',
      requiresApiKey: true,
      models: [],
      maxResolution: { width: 768, height: 768 },
    });
  });
});

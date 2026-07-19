import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('hyperframes-client', () => {
  const originalApiKey = process.env.MISHKAT_API_KEY;
  const originalBrandId = process.env.MISHKAT_BRAND_ID;
  const originalUrl = process.env.MISHKAT_API_URL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.MISHKAT_API_KEY = 'test-key';
    process.env.MISHKAT_BRAND_ID = 'qalem-test-brand';
    delete process.env.MISHKAT_API_URL;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env.MISHKAT_API_KEY = originalApiKey;
    process.env.MISHKAT_BRAND_ID = originalBrandId;
    process.env.MISHKAT_API_URL = originalUrl;
    vi.unstubAllGlobals();
  });

  it('isHyperframesConfigured is true when both API key and brand id are set', async () => {
    const { isHyperframesConfigured } = await import('@/lib/video/hyperframes-client');
    expect(isHyperframesConfigured()).toBe(true);
  });

  it('isHyperframesConfigured is false when the brand id is missing', async () => {
    delete process.env.MISHKAT_BRAND_ID;
    const { isHyperframesConfigured } = await import('@/lib/video/hyperframes-client');
    expect(isHyperframesConfigured()).toBe(false);
  });

  it('createHyperframesProduction posts the brief with Bearer auth to the default base URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'prod_123', status: 'queued' }),
    });

    const { createHyperframesProduction } = await import('@/lib/video/hyperframes-client');
    const brief = {
      brand_id: 'qalem-test-brand',
      intent: 'Expliquer le fonctionnement du cours',
      audience: 'etudiant' as const,
      channel_format: [{ channel: 'presentation' as const, aspect: '16:9' as const }],
      language: { primary: 'fr' as const, rtl: false },
      tone: 'pedagogique' as const,
      duration_s: 30,
      objective: 'awareness' as const,
      sound: { music: true, voiceover: true, captions_burned: true },
    };

    const result = await createHyperframesProduction(brief);

    expect(result).toEqual({ id: 'prod_123', status: 'queued' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mishkat.ai-mpower.com/v1/productions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ brief }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('getHyperframesProduction reads status by id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'prod_123',
        status: 'done',
        variants: [{ lang: 'fr', format: '16x9', gatePassed: true, url: 'https://example/x.mp4' }],
      }),
    });

    const { getHyperframesProduction } = await import('@/lib/video/hyperframes-client');
    const result = await getHyperframesProduction('prod_123');

    expect(result.status).toBe('done');
    expect(result.variants?.[0].url).toBe('https://example/x.mp4');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mishkat.ai-mpower.com/v1/productions/prod_123',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('throws a descriptive error on a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid audience',
    });

    const { getHyperframesProduction } = await import('@/lib/video/hyperframes-client');
    await expect(getHyperframesProduction('prod_bad')).rejects.toThrow(/HTTP 400/);
  });

  it('throws when MISHKAT_API_KEY is not configured', async () => {
    delete process.env.MISHKAT_API_KEY;
    const { getHyperframesProduction } = await import('@/lib/video/hyperframes-client');
    await expect(getHyperframesProduction('prod_123')).rejects.toThrow(/MISHKAT_API_KEY/);
  });
});

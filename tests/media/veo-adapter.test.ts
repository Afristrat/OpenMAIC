import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { generateWithVeo, testVeoConnectivity } from '@/lib/media/adapters/veo-adapter';

const nativeFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', nativeFetch);

describe('veo-adapter', () => {
  beforeEach(() => {
    nativeFetch.mockReset();
  });

  it('teste la connexion avec la clé dans l’en-tête x-goog-api-key, jamais dans l’URL', async () => {
    nativeFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await testVeoConnectivity({
      providerId: 'veo',
      apiKey: 'secret-key',
      baseUrl: 'https://proxy.example.com',
    });

    expect(result.success).toBe(true);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = nativeFetch.mock.calls[0];
    expect(String(url)).toBe('https://proxy.example.com/v1beta/models');
    expect(String(url)).not.toContain('key=');
    expect(String(url)).not.toContain('secret-key');
    expect(init.headers).toEqual({ 'x-goog-api-key': 'secret-key' });
  });

  it('signale une clé refusée sans retenter avec la clé dans l’URL', async () => {
    nativeFetch.mockResolvedValue(new Response('denied', { status: 403 }));
    const result = await testVeoConnectivity({
      providerId: 'veo',
      apiKey: 'secret-key',
      baseUrl: 'https://proxy.example.com',
    });
    expect(result.success).toBe(false);
    expect(nativeFetch.mock.calls.every(([url]) => !String(url).includes('key='))).toBe(true);
  });

  it('soumet et interroge l’opération avec config.fetch (fetch gardé)', async () => {
    const guarded = vi.fn() as Mock;
    guarded
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'op-1' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'op-1',
            done: true,
            response: { videos: [{ bytesBase64Encoded: 'AAAA', mimeType: 'video/mp4' }] },
          }),
          { status: 200 },
        ),
      );
    vi.useFakeTimers();
    try {
      const pending = generateWithVeo(
        {
          providerId: 'veo',
          apiKey: 'k',
          baseUrl: 'https://user.example.com',
          fetch: guarded as typeof fetch,
        },
        { prompt: 'une salle de classe' },
      );
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.url).toBe('data:video/mp4;base64,AAAA');
    } finally {
      vi.useRealTimers();
    }
    expect(guarded).toHaveBeenCalledTimes(2);
    expect(nativeFetch).not.toHaveBeenCalled();
  });
});

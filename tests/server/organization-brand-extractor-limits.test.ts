import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn(), validateUrlForSSRF: vi.fn() }));
vi.mock('@/lib/server/ssrf-guard', () => ({
  safeFetch: mocks.safeFetch,
  validateUrlForSSRF: mocks.validateUrlForSSRF,
}));

describe('extracteur de marque : lecture bornée des pages et feuilles de style', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeFetch.mockReset();
    mocks.validateUrlForSSRF.mockReset().mockResolvedValue(null);
    process.env.CRAWL4AI_BASE_URL = 'http://crawl4ai.internal:11235';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/html')
          ? new Response(
              JSON.stringify({ html: '<html><body style="color:#112233">ok</body></html>' }),
              {
                status: 200,
              },
            )
          : new Response('{}', { status: 500 }),
      ),
    );
  });

  it('interrompt une page chunked sans fin au plafond et libère la connexion', async () => {
    const cancel = vi.fn();
    const dispose = vi.fn().mockResolvedValue(undefined);
    let sent = 0;
    const chunk = new Uint8Array(256 * 1024).fill(97);
    mocks.safeFetch.mockImplementation(async (url: string) => ({
      response: new Response(
        new ReadableStream({
          pull(controller) {
            sent += chunk.byteLength;
            controller.enqueue(chunk);
          },
          cancel,
        }),
        { status: 200 },
      ),
      finalUrl: url,
      dispose,
    }));

    const { extractOrganizationDesignSystem } =
      await import('@/lib/server/organization-brand-extractor');
    await extractOrganizationDesignSystem('https://brand.example.com').catch(() => undefined);

    expect(cancel).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    // PAGE_MAX_CHARS = 3 000 000 : jamais beaucoup plus lu que le plafond.
    expect(sent).toBeLessThanOrEqual(3_000_000 + 2 * chunk.byteLength);
    const init = mocks.safeFetch.mock.calls[0][1] as { signal: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateUrlForSSRFMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: validateUrlForSSRFMock }));
vi.mock('@/lib/logger', () => ({ createLogger: () => loggerMock }));

import { enrichSourcesWithCrawl4AI } from '@/lib/server/crawl4ai';

describe('enrichSourcesWithCrawl4AI', () => {
  beforeEach(() => {
    vi.stubEnv('CRAWL4AI_BASE_URL', 'http://crawl4ai:11235');
    vi.stubEnv('CRAWL4AI_API_TOKEN', 'test-crawl-token');
    validateUrlForSSRFMock.mockReset();
    validateUrlForSSRFMock.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => vi.unstubAllEnvs());

  it('replaces the top source snippet with bounded Crawl4AI Markdown', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ fit_markdown: '# Official LiteLLM documentation\n\nCurrent facts.' }), {
        status: 200,
      }),
    );

    const result = await enrichSourcesWithCrawl4AI(
      [{ title: 'LiteLLM', url: 'https://docs.litellm.ai', content: 'Serper snippet', score: 1 }],
      'LiteLLM documentation',
    );

    expect(result[0].content).toBe('# Official LiteLLM documentation Current facts.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://crawl4ai:11235/md',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-crawl-token',
        },
        body: JSON.stringify({
          url: 'https://docs.litellm.ai',
          f: 'bm25',
          q: 'LiteLLM documentation',
          c: '0',
        }),
      }),
    );
  });

  it('never submits an SSRF-rejected result to the private crawler', async () => {
    validateUrlForSSRFMock.mockResolvedValueOnce('Local/private network URLs are not allowed');

    const result = await enrichSourcesWithCrawl4AI(
      [{ title: 'Unsafe', url: 'http://127.0.0.1/admin', content: 'snippet', score: 1 }],
      'query',
    );

    expect(result[0].content).toBe('snippet');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps Serper snippets when Crawl4AI is not configured', async () => {
    vi.stubEnv('CRAWL4AI_BASE_URL', '');
    const source = { title: 'Source', url: 'https://example.com', content: 'snippet', score: 1 };

    await expect(enrichSourcesWithCrawl4AI([source], 'query')).resolves.toEqual([source]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

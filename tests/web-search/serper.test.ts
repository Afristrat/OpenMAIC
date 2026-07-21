import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxyFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/proxy-fetch', () => ({ proxyFetch: proxyFetchMock }));

import { searchWithSerper } from '@/lib/web-search/serper';

describe('searchWithSerper', () => {
  beforeEach(() => proxyFetchMock.mockReset());

  it('maps organic results and uses the Serper API contract', async () => {
    proxyFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          searchParameters: { q: 'LiteLLM documentation' },
          organic: [
            {
              title: 'LiteLLM Docs',
              link: 'https://docs.litellm.ai',
              snippet: 'Official docs',
              position: 1,
            },
            { title: 'No URL', snippet: 'Ignored' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      searchWithSerper({ query: 'LiteLLM documentation', apiKey: 'key' }),
    ).resolves.toMatchObject({
      query: 'LiteLLM documentation',
      sources: [
        {
          title: 'LiteLLM Docs',
          url: 'https://docs.litellm.ai',
          content: 'Official docs',
          score: 1,
        },
      ],
    });
    expect(proxyFetchMock).toHaveBeenCalledWith(
      'https://google.serper.dev/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'key' },
        body: JSON.stringify({ q: 'LiteLLM documentation', num: 8 }),
      }),
    );
  });
});

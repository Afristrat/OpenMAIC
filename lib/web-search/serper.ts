/**
 * Serper.dev Web Search integration.
 *
 * Serper ranks current Google results. It deliberately returns only result
 * metadata here; trusted full-text extraction is handled separately by the
 * local Crawl4AI enrichment step before a classroom prompt is built.
 */

import { proxyFetch } from '@/lib/server/proxy-fetch';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';

const SERPER_DEFAULT_BASE_URL = 'https://google.serper.dev';
const SERPER_MAX_QUERY_LENGTH = 400;

function buildSerperSearchUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || SERPER_DEFAULT_BASE_URL).replace(/\/$/, '');
  return trimmed.endsWith('/search') ? trimmed : `${trimmed}/search`;
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

interface SerperResponse {
  searchParameters?: { q?: string };
  organic?: SerperOrganicResult[];
}

export async function searchWithSerper(params: {
  query: string;
  apiKey: string;
  maxResults?: number;
  baseUrl?: string;
}): Promise<WebSearchResult> {
  const { query, apiKey, maxResults = 8, baseUrl } = params;
  const boundedQuery = query.slice(0, SERPER_MAX_QUERY_LENGTH);
  const startedAt = Date.now();
  const res = await proxyFetch(buildSerperSearchUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      q: boundedQuery,
      num: Math.min(Math.max(Math.floor(maxResults), 1), 10),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Serper API error (${res.status}): ${errorText || res.statusText}`);
  }

  const data = (await res.json()) as SerperResponse;
  const sources: WebSearchSource[] = (data.organic || [])
    .filter((result) => Boolean(result.link))
    .slice(0, Math.min(Math.max(Math.floor(maxResults), 1), 10))
    .map((result, index) => ({
      title: result.title || result.link || 'Source sans titre',
      url: result.link!,
      content: result.snippet || '',
      score: typeof result.position === 'number' ? 1 / result.position : 1 / (index + 1),
    }));

  return {
    answer: '',
    sources,
    query: data.searchParameters?.q || boundedQuery,
    responseTime: (Date.now() - startedAt) / 1000,
  };
}

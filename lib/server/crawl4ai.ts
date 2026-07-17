/**
 * Enriches ranked web-search sources with bounded, readable primary content
 * from the private Crawl4AI service. Search URLs are untrusted input: each
 * one is validated against SSRF before the internal crawler receives it.
 */

import type { WebSearchSource } from '@/lib/types/web-search';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { createLogger } from '@/lib/logger';

const log = createLogger('Crawl4AI');
const MAX_CRAWLED_SOURCES = 3;
const MAX_EXCERPT_LENGTH = 6000;
const CRAWL_TIMEOUT_MS = 15_000;

interface Crawl4AIResponse {
  markdown?: string;
  fit_markdown?: string;
  data?: {
    markdown?: string;
    fit_markdown?: string;
  };
}

function getCrawl4AIBaseUrl(): string | undefined {
  const value = process.env.CRAWL4AI_BASE_URL?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

function extractMarkdown(value: Crawl4AIResponse): string {
  return (value.fit_markdown || value.markdown || value.data?.fit_markdown || value.data?.markdown || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH);
}

async function crawlSource(
  source: WebSearchSource,
  baseUrl: string,
  query: string,
): Promise<WebSearchSource> {
  const ssrfError = await validateUrlForSSRF(source.url);
  if (ssrfError) {
    log.warn(`Skipping unsafe search result URL: ${ssrfError}`);
    return source;
  }

  try {
    const response = await fetch(`${baseUrl}/md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: source.url, f: 'bm25', q: query, c: '0' }),
      signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn(`Crawl4AI returned ${response.status} for ${new URL(source.url).hostname}`);
      return source;
    }
    const markdown = extractMarkdown((await response.json()) as Crawl4AIResponse);
    return markdown ? { ...source, content: markdown } : source;
  } catch (error) {
    log.warn(`Crawl4AI failed for ${new URL(source.url).hostname}:`, error);
    return source;
  }
}

/**
 * Replaces Serper snippets with readable source content when the local crawler
 * is configured. Deliberately sequential and capped: one classroom must never
 * monopolise the browser pool or turn a research failure into a generation
 * failure.
 */
export async function enrichSourcesWithCrawl4AI(
  sources: readonly WebSearchSource[],
  query: string,
): Promise<WebSearchSource[]> {
  const baseUrl = getCrawl4AIBaseUrl();
  if (!baseUrl || sources.length === 0) return [...sources];

  const enriched: WebSearchSource[] = [];
  for (const [index, source] of sources.entries()) {
    enriched.push(
      index < MAX_CRAWLED_SOURCES ? await crawlSource(source, baseUrl, query) : source,
    );
  }
  return enriched;
}

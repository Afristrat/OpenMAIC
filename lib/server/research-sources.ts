import type { ResearchSource } from '@openmaic/dsl';
import type { WebSearchSource } from '@/lib/types/web-search';

const MAX_PERSISTED_SOURCES = 8;
const MAX_PERSISTED_EXCERPT_LENGTH = 600;

/**
 * Keep an auditable, bounded citation trail with the generated classroom.
 * Crawled page bodies remain transient prompt context; only a short excerpt
 * and its URL are persisted for learners and reviewers.
 */
export function toPersistedResearchSources(sources: readonly WebSearchSource[]): ResearchSource[] {
  const persisted: ResearchSource[] = [];

  for (const source of sources) {
    if (persisted.length === MAX_PERSISTED_SOURCES) break;
    const title = source.title.trim();
    if (!title) continue;

    let url: URL;
    try {
      url = new URL(source.url.trim());
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;

    persisted.push({
      title,
      url: url.toString(),
      excerpt: source.content
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_PERSISTED_EXCERPT_LENGTH),
    });
  }

  return persisted;
}

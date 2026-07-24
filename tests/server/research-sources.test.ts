import { describe, expect, it } from 'vitest';
import { toPersistedResearchSources } from '@/lib/server/research-sources';

describe('toPersistedResearchSources', () => {
  it('retains a bounded, readable citation trail without persisting full crawls', () => {
    const sources = [
      {
        title: '  LiteLLM documentation  ',
        url: ' https://docs.litellm.ai/ ',
        content: `First\n\nsecond ${'x'.repeat(700)}`,
        score: 1,
      },
      { title: '', url: 'https://example.com', content: 'Ignored', score: 0.2 },
      { title: 'Unsafe scheme', url: 'javascript:alert(1)', content: 'Ignored', score: 0.2 },
    ];

    expect(toPersistedResearchSources(sources)).toEqual([
      {
        title: 'LiteLLM documentation',
        url: 'https://docs.litellm.ai/',
        excerpt: `First second ${'x'.repeat(587)}`,
      },
    ]);
  });

  it('caps the persisted citation count', () => {
    const sources = Array.from({ length: 10 }, (_, index) => ({
      title: `Source ${index}`,
      url: `https://example.com/${index}`,
      content: 'Excerpt',
      score: 1,
    }));

    expect(toPersistedResearchSources(sources)).toHaveLength(8);
  });
});

import { describe, expect, it } from 'vitest';

import { getProvider } from '@/lib/ai/providers';

describe('Anthropic provider defaults', () => {
  it('lists Claude Opus 5.5 first with current token windows', () => {
    const models = getProvider('anthropic')?.models ?? [];
    const [latest] = models;

    expect(latest).toMatchObject({
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      contextWindow: 1000000,
      outputWindow: 128000,
      capabilities: {
        streaming: true,
        tools: true,
        vision: true,
      },
    });
  });
});

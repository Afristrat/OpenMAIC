import { describe, expect, it } from 'vitest';
import { formatGenerationError } from '@/lib/server/generation-error';

describe('formatGenerationError', () => {
  it('replaces a provider placeholder with its diagnostic name and status', () => {
    expect(
      formatGenerationError({
        name: 'AI_APICallError',
        message: '<none>',
        statusCode: 504,
      }),
    ).toBe('AI_APICallError · HTTP 504');
  });

  it('keeps a useful nested cause without exposing response bodies', () => {
    expect(
      formatGenerationError({
        name: 'AI_APICallError',
        message: '<none>',
        responseBody: 'secret provider payload',
        cause: new Error('request timed out'),
      }),
    ).toBe('AI_APICallError · request timed out');
  });
});

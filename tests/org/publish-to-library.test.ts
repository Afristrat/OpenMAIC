import { describe, expect, test } from 'vitest';
import {
  publishStagesToLibrary,
  summarizePublication,
  type ExistingShare,
  type ShareRepository,
} from '@/lib/org/publish-to-library';

function repository(
  existing: ExistingShare[],
  errors: Record<string, string> = {},
): ShareRepository & { inserted: string[]; made: string[] } {
  const inserted: string[] = [];
  const made: string[] = [];
  return {
    inserted,
    made,
    listExisting: async () => existing,
    insert: async (_orgId, stageId) => {
      if (errors[stageId]) return errors[stageId];
      inserted.push(stageId);
      return null;
    },
    makeVisibleToOrganization: async (shareId) => {
      made.push(shareId);
      return null;
    },
  };
}

describe('publishStagesToLibrary', () => {
  test('publishes every new formation and reports each one', async () => {
    const repo = repository([]);
    const results = await publishStagesToLibrary(repo, 'org-1', ['a', 'b', 'c']);
    expect(results.map((r) => r.outcome)).toEqual(['published', 'published', 'published']);
    expect(repo.inserted).toEqual(['a', 'b', 'c']);
  });

  test('does not publish twice and ignores duplicate ids', async () => {
    const repo = repository([{ id: 's1', stageId: 'a', visibility: 'organization' }]);
    const results = await publishStagesToLibrary(repo, 'org-1', ['a', 'a', 'b']);
    expect(results).toEqual([
      { stageId: 'a', outcome: 'already' },
      { stageId: 'b', outcome: 'published' },
    ]);
    expect(repo.inserted).toEqual(['b']);
  });

  test('turns a private share into an organisation share instead of inserting again', async () => {
    const repo = repository([{ id: 's9', stageId: 'a', visibility: 'private' }]);
    const results = await publishStagesToLibrary(repo, 'org-1', ['a']);
    expect(results).toEqual([{ stageId: 'a', outcome: 'published' }]);
    expect(repo.made).toEqual(['s9']);
    expect(repo.inserted).toEqual([]);
  });

  test('one refusal never blocks the others, and the database refusal is named', async () => {
    const repo = repository([], { b: '42501', c: '23505' });
    const results = await publishStagesToLibrary(repo, 'org-1', ['a', 'b', 'c']);
    expect(results.map((r) => r.outcome)).toEqual(['published', 'denied', 'failed']);
    expect(summarizePublication(results)).toEqual({
      published: 1,
      already: 0,
      denied: 1,
      failed: 1,
    });
  });

  test('does nothing for an empty selection', async () => {
    expect(await publishStagesToLibrary(repository([]), 'org-1', [])).toEqual([]);
  });
});

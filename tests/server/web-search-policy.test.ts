import { describe, expect, it } from 'vitest';
import { shouldRunClassroomWebSearch } from '@/lib/server/web-search-policy';

describe('classroom web-search policy', () => {
  it('honours an explicit request to use only the attached source', () => {
    expect(
      shouldRunClassroomWebSearch({
        enabled: true,
        hasUploadedSource: true,
        requirement: 'Crée une formation fondée exclusivement sur le PDF joint.',
      }),
    ).toBe(false);
  });

  it('keeps research enabled when the author did not request source exclusivity', () => {
    expect(
      shouldRunClassroomWebSearch({
        enabled: true,
        hasUploadedSource: true,
        requirement: 'Utilise le PDF joint et complète avec des sources récentes.',
      }),
    ).toBe(true);
  });
});

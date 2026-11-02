import { describe, expect, it } from 'vitest';
import { canPublishToLibrary } from '@/lib/org/can-publish-to-library';

describe('canPublishToLibrary', () => {
  it.each(['admin', 'manager'] as const)('autorise le rôle %s', (role) => {
    expect(canPublishToLibrary(role)).toBe(true);
  });

  it.each(['formateur', 'author', 'apprenant'] as const)('refuse le rôle %s', (role) => {
    expect(canPublishToLibrary(role)).toBe(false);
  });

  it('refuse l’absence de rôle', () => {
    expect(canPublishToLibrary(null)).toBe(false);
    expect(canPublishToLibrary(undefined)).toBe(false);
  });
});

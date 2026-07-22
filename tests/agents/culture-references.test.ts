import { describe, expect, it } from 'vitest';
import {
  CULTURE_REFERENCE_VERSION,
  CULTURE_REFERENCES,
  resolveCultureReference,
} from '@/lib/agents/culture-references';

describe('culture references', () => {
  it('sont versionnés et restent inactifs avant le checkpoint humain', () => {
    expect(CULTURE_REFERENCE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CULTURE_REFERENCES).toHaveLength(3);
    expect(
      CULTURE_REFERENCES.every((reference) => reference.status === 'pending-human-approval'),
    ).toBe(true);
    expect(resolveCultureReference('unknown')).toEqual(CULTURE_REFERENCES[0]);
  });
});

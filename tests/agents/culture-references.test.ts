import { describe, expect, it } from 'vitest';
import {
  CULTURE_REFERENCE_VERSION,
  CULTURE_REFERENCES,
  resolveCultureReference,
} from '@/lib/agents/culture-references';

describe('culture references', () => {
  it('sont versionnés et restent soumis à l’approbation de chaque organisation', () => {
    expect(CULTURE_REFERENCE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CULTURE_REFERENCES).toHaveLength(3);
    expect(
      CULTURE_REFERENCES.every((reference) => reference.status === 'pending-human-approval'),
    ).toBe(true);
    expect(resolveCultureReference('unknown')).toEqual(CULTURE_REFERENCES[0]);
  });

  it('fournissent au moins vingt prénoms par genre et par culture', () => {
    for (const reference of CULTURE_REFERENCES) {
      for (const gender of ['female', 'male'] as const) {
        const names = reference.names.filter((name) => name.gender === gender);

        expect(names, `${reference.code}/${gender}`).toHaveLength(20);
        expect(new Set(names.map((name) => name.display)).size, `${reference.code}/${gender}`).toBe(
          names.length,
        );
      }
    }
  });

  it('associe chaque prénom arabe à une romanisation non vide', () => {
    const arabicReference = CULTURE_REFERENCES.find((reference) => reference.code === 'ma-ar');

    expect(arabicReference).toBeDefined();
    for (const name of arabicReference?.names ?? []) {
      expect(name.display).toMatch(/[\u0600-\u06ff]/u);
      expect(name.romanized?.trim()).toBeTruthy();
    }
  });
});

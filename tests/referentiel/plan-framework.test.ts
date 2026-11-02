import { describe, expect, it } from 'vitest';
import {
  classifyRequestedSkills,
  competencyFrameworkSchema,
  frameworkDirective,
  FrameworkError,
  requireBaseIscoCode,
} from '@/lib/referentiel/plan-framework';

const occupation = { essential_uris: ['s:a', 's:b'], optional_uris: ['s:c'] };

describe('competencyFrameworkSchema', () => {
  it('requires a target occupation, an empty skill list being refused later as a missing framework', () => {
    expect(
      competencyFrameworkSchema.safeParse({ occupationUri: 'o:1', skillUris: ['s:a'] }).success,
    ).toBe(true);
    expect(
      competencyFrameworkSchema.safeParse({ occupationUri: 'o:1', skillUris: [] }).success,
    ).toBe(true);
    expect(competencyFrameworkSchema.safeParse({ skillUris: ['s:a'] }).success).toBe(false);
    expect(
      competencyFrameworkSchema.safeParse({ occupationUri: 'o:1', skillUris: ['s:a'], extra: 1 })
        .success,
    ).toBe(false);
  });
});

describe('classifyRequestedSkills', () => {
  it('splits essential, optional and foreign skills, without duplicates', () => {
    expect(classifyRequestedSkills(occupation, ['s:a', 's:c', 's:a', 's:z'])).toEqual({
      accepted: [
        { uri: 's:a', nature: 'essentielle' },
        { uri: 's:c', nature: 'optionnelle' },
      ],
      foreign: ['s:z'],
    });
  });
});

describe('requireBaseIscoCode', () => {
  it('accepts a four-digit ISCO-08 base group only', () => {
    expect(requireBaseIscoCode('2513')).toBe('2513');
    for (const bad of ['25', '251', null, undefined, '25a3']) {
      expect(() => requireBaseIscoCode(bad)).toThrow(FrameworkError);
    }
  });
});

describe('frameworkDirective', () => {
  it('states the occupation, its ISCO code and the skills the plan must serve', () => {
    const text = frameworkDirective({
      occupation: {
        uri: 'o:1',
        titleFr: 'développeur web',
        isco08: '2513',
        referentialVersion: 'd@1',
      },
      skills: [
        { uri: 's:a', title: 'Concevoir une interface', nature: 'essentielle' },
        { uri: 's:c', title: 'Tester en continu', nature: 'optionnelle' },
      ],
    });
    expect(text).toContain('ISCO-08 2513');
    expect(text).toContain('développeur web');
    expect(text).toContain('- Concevoir une interface');
    expect(text).toContain('Optional skills');
    expect(text).toContain('- Tester en continu');
  });
});

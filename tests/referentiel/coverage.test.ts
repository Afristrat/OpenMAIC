import { describe, expect, it } from 'vitest';
import type { Competence, OccupationCompetencies } from '@/lib/referentiel/case-client';
import { computeOccupationCoverage } from '@/lib/referentiel/coverage';

function competence(escoUri: string | null, competenceUri: string, title: string): Competence {
  return { competenceUri, escoUri, title, titles: { fr: title, ar: null, en: null } };
}

const ESCO_A = 'http://data.europa.eu/esco/skill/a';
const ESCO_B = 'http://data.europa.eu/esco/skill/b';
const CASE_C = 'https://referentiel.ai-mpower.com/ims/case/v1p0/CFItems/c';

const occupation: OccupationCompetencies = {
  occupation: {
    title: 'Développeur web',
    escoUri: 'http://data.europa.eu/esco/occupation/00000000-0000-4000-8000-000000000001',
    iscoCode: '2513',
    referentielVersion: 'doc@2026-10-31',
  },
  essential: [competence(ESCO_A, ESCO_A, 'A'), competence(ESCO_B, ESCO_B, 'B')],
  optional: [competence(null, CASE_C, 'C')],
};

describe('computeOccupationCoverage', () => {
  it('counts the linked competences and lists the missing ones per nature', () => {
    const coverage = computeOccupationCoverage(occupation, [ESCO_A, CASE_C, 'http://other/skill']);

    expect(coverage.essential).toMatchObject({ total: 2, covered: 1, ratio: 0.5 });
    expect(coverage.essential.missing.map((item) => item.competenceUri)).toEqual([ESCO_B]);
    expect(coverage.optional).toMatchObject({ total: 1, covered: 1, ratio: 1, missing: [] });
    expect(coverage.occupation.iscoCode).toBe('2513');
  });

  it('reports a zero ratio, never NaN, when the occupation has no competence of a nature', () => {
    const coverage = computeOccupationCoverage({ ...occupation, optional: [] }, []);

    expect(coverage.optional).toEqual({ total: 0, covered: 0, ratio: 0, missing: [] });
    expect(coverage.essential).toMatchObject({ covered: 0, ratio: 0 });
  });

  it('treats a link on the ESCO URI as covering a competence keyed by another URI', () => {
    const keyedByCase = competence(ESCO_A, CASE_C, 'A en CASE');
    const coverage = computeOccupationCoverage(
      { ...occupation, essential: [keyedByCase], optional: [] },
      [ESCO_A],
    );

    expect(coverage.essential).toMatchObject({ total: 1, covered: 1, ratio: 1 });
  });
});

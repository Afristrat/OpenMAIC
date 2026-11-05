import { describe, expect, it } from 'vitest';
import {
  codeFramework,
  sanitizeSceneCompetencies,
  uncoveredEssentials,
  uncoveredRequiredEssentials,
} from '@/lib/referentiel/plan-coverage';
import {
  frameworkDirective,
  type ResolvedCompetencyFramework,
} from '@/lib/referentiel/plan-framework';
import type { SceneOutline } from '@/lib/types/generation';

const resolved: ResolvedCompetencyFramework = {
  occupation: {
    uri: 'http://data.europa.eu/esco/occupation/x',
    titleFr: 'Conseiller',
    isco08: '2423',
    referentialVersion: 'v1',
  },
  skills: [
    { uri: 'u-opt', title: 'Écrire un rapport', nature: 'optionnelle' },
    { uri: 'u-a', title: 'Écouter', nature: 'essentielle' },
    { uri: 'u-b', title: 'Conseiller', nature: 'essentielle' },
  ],
};

function outline(id: string, competencies?: unknown): SceneOutline {
  return {
    id,
    type: 'slide',
    title: id,
    description: 'd',
    keyPoints: [],
    order: 1,
    ...(competencies === undefined ? {} : { competencies: competencies as string[] }),
  };
}

describe('couverture des compétences par les séquences', () => {
  const framework = codeFramework(resolved);

  it('code les essentielles d’abord, puis les optionnelles', () => {
    expect(framework.skills.map((skill) => [skill.code, skill.uri])).toEqual([
      ['C1', 'u-a'],
      ['C2', 'u-b'],
      ['C3', 'u-opt'],
    ]);
  });

  it('numérote les compétences dans la consigne du plan et exige le champ competencies', () => {
    const directive = frameworkDirective(resolved);
    expect(directive).toContain('- C1: Écouter');
    expect(directive).toContain('- C3: Écrire un rapport');
    expect(directive).toContain('`competencies`');
  });

  it('écarte les codes inventés, les doublons et les valeurs étrangères', () => {
    const [clean] = sanitizeSceneCompetencies(
      [outline('s1', ['c2', 'C2', 'C9', 42, ' C1 '])],
      framework,
    );
    expect(clean.competencies).toEqual(['C1', 'C2']);
  });

  it('une séquence sans champ devient une séquence sans compétence', () => {
    const [clean] = sanitizeSceneCompetencies([outline('s1')], framework);
    expect(clean.competencies).toEqual([]);
  });

  it('signale les essentielles qu’aucune séquence ne travaille', () => {
    const gaps = uncoveredEssentials([outline('s1', ['C1']), outline('s2', ['C3'])], framework);
    expect(gaps.map((gap) => gap.code)).toEqual(['C2']);
  });

  it('plus aucun manque quand chaque essentielle est travaillée', () => {
    expect(uncoveredEssentials([outline('s1', ['C1', 'C2'])], framework)).toEqual([]);
  });

  it('à la création, rapproche par URI : un plan qui ignore une compétence choisie après coup est refusé', () => {
    const outlines = [outline('s1', ['C1', 'C2'])];
    expect(uncoveredRequiredEssentials(outlines, framework, resolved)).toEqual([]);

    const withExtra: ResolvedCompetencyFramework = {
      ...resolved,
      skills: [...resolved.skills, { uri: 'u-new', title: 'Négocier', nature: 'essentielle' }],
    };
    expect(uncoveredRequiredEssentials(outlines, framework, withExtra)).toEqual([
      { uri: 'u-new', title: 'Négocier' },
    ]);
  });

  it('un plan sans cadre embarqué ne couvre aucune essentielle', () => {
    expect(uncoveredRequiredEssentials([outline('s1', ['C1'])], undefined, resolved)).toHaveLength(
      2,
    );
  });
});

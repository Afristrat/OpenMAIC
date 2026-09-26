import { describe, expect, it } from 'vitest';
import {
  buildSceneSourceGrounding,
  formatSourceGroundingForPrompt,
  uploadedSourceDocument,
  type SourceDocument,
} from '@/lib/generation/source-grounding';
import type { SceneOutline } from '@/lib/types/generation';

function outline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-margin',
    type: 'slide',
    title: 'Piloter la marge contributive',
    description: 'Calculer la marge contributive cible du magasin.',
    keyPoints: ['marge contributive', 'objectif magasin'],
    order: 0,
    ...overrides,
  };
}

function source(id: string, text: string): SourceDocument {
  return { id, version: 'v1-test', title: `${id}.pdf`, text };
}

describe('scene source grounding', () => {
  it('selects the document detail that is absent from a short plan summary', () => {
    const grounding = buildSceneSourceGrounding(outline(), [
      source(
        'operations-guide',
        [
          'Introduction générale sans donnée financière.',
          'Pour le magasin pilote, la marge contributive cible est exactement de 37,5 % du chiffre d’affaires.',
          'Annexe sur les horaires et les contacts.',
        ].join('\n\n'),
      ),
    ]);

    expect(grounding?.status).toBe('grounded');
    expect(grounding?.passages.some((passage) => passage.text.includes('37,5 %'))).toBe(true);
    expect(grounding?.passages[0].id).toContain('operations-guide:v1-test:p');
  });

  it('marks a scene unsupported instead of injecting an unrelated document', () => {
    const grounding = buildSceneSourceGrounding(outline(), [
      source('safety-guide', 'Procédure d’évacuation incendie et numéros de secours.'),
    ]);

    expect(grounding).toMatchObject({ status: 'unsupported', passages: [] });
    expect(grounding?.issues[0]).toMatchObject({ type: 'unsupported' });
  });

  it('surfaces contradictory passages from two source versions', () => {
    const grounding = buildSceneSourceGrounding(outline(), [
      source(
        'policy-a',
        'La marge contributive cible du magasin pilote est fixée à 30 % du chiffre d’affaires annuel.',
      ),
      source(
        'policy-b',
        'La marge contributive cible du magasin pilote est fixée à 45 % du chiffre d’affaires annuel.',
      ),
    ]);

    expect(grounding?.status).toBe('contradictory');
    expect(grounding?.issues[0]).toMatchObject({
      type: 'contradictory',
      passageIds: expect.arrayContaining([
        expect.stringContaining('policy-a'),
        expect.stringContaining('policy-b'),
      ]),
    });
  });

  it('keeps a method and its numeric case study complementary', () => {
    const grounding = buildSceneSourceGrounding(
      outline({
        title: 'Décider avec une prévision glissante',
        description: 'Appliquer la méthode à Atlas Services.',
        keyPoints: ['prévision glissante', 'seuil de sécurité', 'décision'],
      }),
      [
        source(
          'method',
          [
            'Chaque semaine, mettre à jour les encaissements confirmés, les décaissements engagés et le solde disponible.',
            'Le point bas est le solde de clôture le plus faible de l’horizon. Il doit être comparé au seuil de sécurité défini par l’entreprise.',
            'Le suivi hebdomadaire sert à décider tôt ; il ne transforme jamais une prévision en certitude.',
          ].join(' '),
        ),
        source(
          'case-study',
          [
            'Atlas Services dispose d’un solde initial de 180 000 dirhams et d’un seuil de sécurité de 70 000 dirhams.',
            'En semaine 2, les encaissements sont de 60 000 dirhams et les décaissements de 142 000 dirhams.',
            'Une dépense marketing de 30 000 dirhams peut être décalée sans pénalité.',
          ].join(' '),
        ),
      ],
    );

    expect(grounding?.status).toBe('grounded');
    expect(grounding?.issues).toEqual([]);
  });

  it('versions the same uploaded source again when its content changes', () => {
    const first = uploadedSourceDocument({ name: 'guide.pdf', text: 'Version une', images: [] });
    const second = uploadedSourceDocument({ name: 'guide.pdf', text: 'Version deux', images: [] });

    expect(second.id).toBe(first.id);
    expect(second.version).not.toBe(first.version);
  });

  it('formats only the selected passages and their durable identifiers for the model', () => {
    const grounding = buildSceneSourceGrounding(outline(), [
      source('guide', 'La marge contributive cible du magasin pilote est de 37,5 %.'),
    ]);
    const prompt = formatSourceGroundingForPrompt(grounding);

    expect(prompt).toContain('source=guide version=v1-test');
    expect(prompt).toContain('37,5 %');
    expect(prompt).toContain('never fill the gap');
  });
});

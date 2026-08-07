import { describe, expect, it } from 'vitest';
import {
  buildMarketAdaptationInstruction,
  planMarketAdaptation,
} from '@/lib/formation-engine/market-adaptation';
import type { Scene, Stage } from '@/lib/types/stage';

const stage = {
  id: 'course-1',
  name: 'Trésorerie des TPE',
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
} as Stage;

const scenes = [
  {
    id: 'slide-money',
    stageId: 'course-1',
    order: 1,
    title: 'Budget à Casablanca',
    type: 'slide',
    content: {
      type: 'slide',
      canvas: {
        elements: [{ id: 'text-1', type: 'text', content: 'Budget indicatif : 10 000 MAD' }],
      },
    },
    actions: [{ type: 'speech', text: 'Au Maroc, ce budget est exprimé en MAD.' }],
  },
  {
    id: 'slide-neutral',
    stageId: 'course-1',
    order: 2,
    title: 'Décider',
    type: 'slide',
    content: {
      type: 'slide',
      canvas: { elements: [{ id: 'text-2', type: 'text', content: 'Comparer trois options.' }] },
    },
    actions: [],
  },
  {
    id: 'quiz-money',
    stageId: 'course-1',
    order: 3,
    title: 'Vérification',
    type: 'quiz',
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: 'Quel budget en MAD convient au cas marocain ?',
          options: [],
        },
      ],
    },
    actions: [],
  },
] as unknown as Scene[];

describe('planMarketAdaptation', () => {
  it('inclut toutes les scènes car les dépendances au marché peuvent être implicites', () => {
    const plan = planMarketAdaptation(stage, scenes, {
      territory: 'France',
      currencyCode: 'EUR',
    });

    expect(plan.impacts).toEqual([
      {
        sceneId: 'slide-money',
        order: 1,
        title: 'Budget à Casablanca',
        sceneType: 'slide',
        reasons: ['currency', 'territory'],
        automatable: true,
      },
      {
        sceneId: 'slide-neutral',
        order: 2,
        title: 'Décider',
        sceneType: 'slide',
        reasons: ['currency', 'territory'],
        automatable: true,
      },
      {
        sceneId: 'quiz-money',
        order: 3,
        title: 'Vérification',
        sceneType: 'quiz',
        reasons: ['currency', 'territory'],
        automatable: false,
      },
    ]);
  });

  it('ne signale rien lorsque le contexte cible est identique', () => {
    const plan = planMarketAdaptation(stage, scenes, {
      territory: ' Maroc ',
      currencyCode: 'mad',
    });

    expect(plan.hasChanges).toBe(false);
    expect(plan.impacts).toEqual([]);
  });
});

describe('buildMarketAdaptationInstruction', () => {
  it('borne la régénération aux diapositives affectées et interdit la conversion non sourcée', () => {
    const plan = planMarketAdaptation(stage, scenes, {
      territory: 'France',
      currencyCode: 'EUR',
    });

    expect(buildMarketAdaptationInstruction(plan)).toBe(
      [
        'Adapte uniquement les diapositives suivantes au territoire France et à la devise EUR : slide-money, slide-neutral.',
        'Conserve leurs objectifs, leur ordre, leur structure pédagogique et les éléments sans rapport avec le marché.',
        'Adapte les exemples, contraintes, budgets, textes visibles et notes de présentation qui dépendent du Maroc ou de MAD.',
        'Ne convertis aucun montant existant sans taux de change actuel et sourcé. Sans source suffisante, reformule le montant comme une hypothèse illustrative explicite dans la devise cible.',
        'N’utilise jamais de tiret cadratin.',
      ].join(' '),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { findQuizRelevanceIssue, generateSceneContent } from '@/lib/generation/scene-generator';
import type { QuizQuestion } from '@/lib/types/stage';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

const cashFlowOutline: SceneOutline = {
  id: 'cash-flow-quiz',
  type: 'quiz',
  title: 'Quiz final et conclusion',
  description: 'Vérifier la maîtrise de la prévision de trésorerie.',
  keyPoints: ['Prévision glissante', 'Solde hebdomadaire', 'Alertes et scénarios'],
  order: 8,
};

function question(questionText: string, analysis: string): QuizQuestion {
  return {
    id: 'q1',
    type: 'single',
    question: questionText,
    options: [
      { value: 'A', label: 'Réponse A' },
      { value: 'B', label: 'Réponse B' },
    ],
    answer: ['A'],
    hasAnswer: true,
    analysis,
    points: 20,
  };
}

describe('quiz course relevance', () => {
  it('rejects a well-formed quiz copied from an unrelated course', () => {
    const issue = findQuizRelevanceIssue(
      [
        question(
          'Quel est le rôle du switch dans un paiement mobile interopérable ?',
          'Il route les transactions entre les établissements bancaires.',
        ),
      ],
      cashFlowOutline,
      [cashFlowOutline],
      'Construire une prévision glissante de trésorerie sur 13 semaines en MAD.',
    );

    expect(issue).toContain('unrelated');
  });

  it('accepts questions grounded in the approved cash-flow course', () => {
    const issue = findQuizRelevanceIssue(
      [
        question(
          'Pourquoi actualiser le solde hebdomadaire dans une prévision glissante ?',
          'Cette actualisation permet d’anticiper les alertes de trésorerie.',
        ),
      ],
      cashFlowOutline,
      [cashFlowOutline],
      'Construire une prévision glissante de trésorerie sur 13 semaines en MAD.',
    );

    expect(issue).toBeNull();
  });

  it('rejects a quiz whose generated question count differs from the approved syllabus', async () => {
    const outline: SceneOutline = {
      ...cashFlowOutline,
      quizConfig: {
        questionCount: 5,
        difficulty: 'medium',
        questionTypes: ['single'],
      },
    };
    let correction = '';
    const generated = Array.from({ length: 4 }, (_, index) => ({
      ...question(`Question de trésorerie ${index + 1}`, 'Analyse de trésorerie'),
      id: `q${index + 1}`,
    }));

    const result = await generateSceneContent(outline, async () => JSON.stringify(generated), {
      userRequirements: {
        requirement: 'Terminer par un quiz final de cinq questions sur la trésorerie.',
      },
      courseOutlines: [outline],
      onValidationFailure: (directive) => {
        correction = directive;
      },
    });

    expect(result).toBeNull();
    expect(correction).toContain('exactly 5');
  });
});

describe('cash-flow simulator horizon', () => {
  it('normalizes a 13-week course to weekly controls and labels', async () => {
    const outline: SceneOutline = {
      id: 'cash-flow-plugin',
      type: 'plugin',
      pluginType: 'cash-flow-simulator',
      title: 'Simulateur de trésorerie sur 13 semaines',
      description: 'Tester une prévision glissante sur 13 semaines.',
      keyPoints: ['Encaissements hebdomadaires', 'Décaissements hebdomadaires'],
      order: 4,
    };
    const requirements: UserRequirements = {
      requirement: 'Piloter la trésorerie sur 13 semaines en MAD.',
    };
    const aiCall = async () =>
      JSON.stringify({
        title: 'Simulateur',
        instructions: 'Ajustez les paramètres.',
        currency: 'MAD',
        assumptions: {
          openingCash: { label: 'Solde initial', value: 50000 },
          monthlyRevenue: { label: 'Revenus mensuels', value: 20000 },
          monthlyCosts: { label: 'Charges mensuelles', value: 15000 },
          revenueGrowth: { label: 'Croissance mensuelle', value: 1 },
          months: { label: 'Horizon', value: 12, unit: 'mois' },
        },
        labels: {
          endingCash: 'Solde final',
          monthlyBalance: 'Solde mensuel',
          alert: 'Alerte',
          month: 'Mois',
          none: 'Aucune',
          cashPath: 'Trajectoire mensuelle',
        },
      });

    const result = await generateSceneContent(outline, aiCall, {
      userRequirements: requirements,
      courseOutlines: [outline],
    });

    expect(result).toMatchObject({
      pluginType: 'cash-flow-simulator',
      data: {
        assumptions: {
          monthlyRevenue: { label: 'Encaissements hebdomadaires' },
          monthlyCosts: { label: 'Décaissements hebdomadaires' },
          months: { value: 13, max: 52, unit: 'semaines' },
        },
        labels: {
          monthlyBalance: 'Solde de la première semaine',
          month: 'Semaine',
          cashPath: 'Trajectoire hebdomadaire',
        },
      },
    });
  });
});

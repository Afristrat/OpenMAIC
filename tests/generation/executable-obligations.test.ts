import { describe, expect, it } from 'vitest';
import { enforceExecutableObligations } from '@/lib/generation/executable-obligations';
import type { ClassroomPlan, SceneOutline } from '@/lib/types/generation';

function scene(
  partial: Partial<SceneOutline> & Pick<SceneOutline, 'id' | 'type' | 'title' | 'order'>,
): SceneOutline {
  return {
    description: '',
    keyPoints: [],
    ...partial,
  };
}

const requirement =
  'Génère un véritable classeur Excel modifiable pour une prévision glissante de trésorerie sur 13 semaines. Affiche un lien court et un QR code, puis fais déposer ce même fichier pour un diagnostic Python.';

function unsafePlan(): ClassroomPlan {
  return {
    courseTitle: 'Trésorerie',
    languageDirective: 'Teach in French.',
    syllabus: {
      audience: 'PME',
      prerequisites: 'Aucun',
      overallObjective: 'Piloter la trésorerie',
      learningObjectives: ['Construire une prévision'],
      totalDurationMinutes: 30,
      deliveryMode: 'En ligne',
      assessmentStrategy: 'Projet',
      expectedDeliverable: 'Classeur',
    },
    outlines: [
      scene({ id: 'intro', type: 'slide', title: 'Introduction', order: 1 }),
      scene({
        id: 'download',
        type: 'slide',
        title: 'Téléchargement du classeur',
        description: 'Téléchargez le fichier depuis https://qalem.ma.',
        order: 2,
      }),
      scene({ id: 'project', type: 'pbl', title: 'Compléter le classeur', order: 3 }),
      scene({
        id: 'fake-result',
        type: 'slide',
        title: 'Diagnostic Python',
        description: 'Travail conforme.',
        keyPoints: ['Bonne analyse.', 'Aucun axe d’amélioration nécessaire.'],
        order: 4,
      }),
    ],
  };
}

describe('executable learning obligations', () => {
  it('turns a promised cash-flow workbook into a real generation and evaluation contract', () => {
    const result = enforceExecutableObligations(unsafePlan(), requirement);
    const request = result.outlines[1].resourceGenerations?.[0];

    expect(request).toMatchObject({
      format: 'xlsx',
      fileName: 'prevision-tresorerie-13-semaines.xlsx',
      evaluationProfile: 'cash-flow-13-week',
    });
    expect(request?.prompt).toContain('MAD');
  });

  it('removes a verdict fabricated before the learner upload', () => {
    const result = enforceExecutableObligations(unsafePlan(), requirement);
    const diagnostic = result.outlines[3];

    expect(diagnostic.title).toBe('Comprendre le diagnostic Python');
    expect(JSON.stringify(diagnostic)).not.toMatch(/Travail conforme|Bonne analyse|Aucun axe/);
    expect(diagnostic.description).toContain('après le dépôt');
  });

  it('preserves an existing request while adding the deterministic evaluator', () => {
    const plan = unsafePlan();
    plan.outlines[1].resourceGenerations = [
      {
        id: 'author-workbook',
        format: 'xlsx',
        title: 'Classeur auteur',
        fileName: 'auteur.xlsx',
        prompt: 'Conserver la structure demandée par l’auteur.',
      },
    ];

    const result = enforceExecutableObligations(plan, requirement);
    expect(result.outlines[1].resourceGenerations).toEqual([
      expect.objectContaining({
        id: 'author-workbook',
        fileName: 'auteur.xlsx',
        evaluationProfile: 'cash-flow-13-week',
      }),
    ]);
  });

  it('moves a workbook contract from a non-renderable PBL scene to the download slide', () => {
    const plan = unsafePlan();
    plan.outlines[2].resourceGenerations = [
      {
        id: 'misplaced-workbook',
        format: 'xlsx',
        title: 'Classeur déplacé',
        fileName: 'deplace.xlsx',
        prompt: 'Créer le classeur.',
      },
    ];

    const result = enforceExecutableObligations(plan, requirement);
    expect(result.outlines[1].resourceGenerations).toEqual([
      expect.objectContaining({
        id: 'misplaced-workbook',
        evaluationProfile: 'cash-flow-13-week',
      }),
    ]);
    expect(result.outlines[2].resourceGenerations).toEqual([]);
    expect(result.outlines[1].description).not.toContain('https://qalem.ma');
  });

  it('removes decorative QR media from scenes that do not own the real resource', () => {
    const plan = unsafePlan();
    plan.outlines[0].mediaGenerations = [
      {
        type: 'image',
        elementId: 'fake-qr',
        prompt: 'Créer un QR code décoratif pour télécharger le classeur',
      },
      {
        type: 'image',
        elementId: 'cash-flow-chart',
        prompt: 'Créer un graphique de trésorerie sur 13 semaines',
      },
    ];

    const result = enforceExecutableObligations(plan, requirement);

    expect(result.outlines[0].mediaGenerations).toEqual([
      expect.objectContaining({ elementId: 'cash-flow-chart' }),
    ]);
  });

  it('does not invent an exact alert threshold when the author did not provide one', () => {
    const plan = unsafePlan();
    plan.outlines.splice(
      2,
      0,
      scene({
        id: 'knowledge-check',
        type: 'quiz',
        title: 'Vérification des connaissances',
        keyPoints: ['Question sur le seuil minimal en MAD'],
        order: 3,
      }),
    );

    const result = enforceExecutableObligations(plan, requirement);

    expect(result.outlines[2].keyPoints).toEqual([
      'Interpréter une alerte à partir du seuil configuré dans le classeur, sans inventer de montant.',
    ]);
  });

  it('does not invent a resource when the author did not request one', () => {
    const plan = unsafePlan();
    const result = enforceExecutableObligations(plan, 'Explique les principes de trésorerie.');
    expect(result).toBe(plan);
  });
});

import { describe, expect, it } from 'vitest';
import { importCanvasToClassroomPlan } from '@/lib/courses/import-canvas-to-plan';

const canvas = `# Décider quelles tâches automatiser

## Résultat professionnel visé
Prioriser une automatisation réversible.

## Pour qui et dans quel contexte
Responsables opérationnels de PME marocaines, débutants en IA.

## Chapitre 1 — Repérer une tâche utile
### Objectif observable
Cartographier une tâche récurrente et mesurable.
### Contenu essentiel
Une tâche stable est vérifiable. Une décision sensible garde un contrôle humain.
### Mise en pratique ou point de contrôle
Classer trois tâches avec une grille.

## Preuve finale d’application
Une fiche d’expérimentation de deux semaines avec critère d’arrêt.`;

describe('importCanvasToClassroomPlan', () => {
  it('maps every normative section into the native editable plan contract', () => {
    const plan = importCanvasToClassroomPlan(canvas, 'fr-FR');

    expect(plan).toMatchObject({
      courseTitle: 'Décider quelles tâches automatiser',
      languageDirective: expect.stringContaining('fr-FR'),
      syllabus: {
        audience: expect.stringContaining('PME marocaines'),
        overallObjective: 'Prioriser une automatisation réversible.',
        learningObjectives: ['Cartographier une tâche récurrente et mesurable.'],
        expectedDeliverable: expect.stringContaining('fiche d’expérimentation'),
      },
      outlines: [
        {
          id: 'import-chapter-1',
          title: 'Chapitre 1 — Repérer une tâche utile',
          teachingObjective: 'Cartographier une tâche récurrente et mesurable.',
          keyPoints: expect.arrayContaining(['Une tâche stable est vérifiable.']),
          order: 1,
        },
        { id: 'import-final-evidence', order: 2 },
      ],
    });
  });
});

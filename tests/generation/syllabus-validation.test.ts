import { describe, expect, it } from 'vitest';
import { getSyllabusValidationIssues } from '@/lib/generation/syllabus-validation';
import type { ClassroomSyllabus, SceneOutline } from '@/lib/types/generation';

const syllabus: ClassroomSyllabus = {
  audience: 'Responsables des opérations',
  prerequisites: 'Connaître un processus réel',
  overallObjective: 'Cartographier et améliorer un processus réel',
  learningObjectives: ['Cartographier le processus', 'Choisir une action mesurable'],
  totalDurationMinutes: 45,
  deliveryMode: 'Formation immersive',
  assessmentStrategy: 'Classeur complété et argumenté',
  expectedDeliverable: 'Plan d’action sur 30 jours',
};

const outline: SceneOutline = {
  id: 'scene_1',
  type: 'slide',
  title: 'Cartographier le processus',
  description: 'Construire la carte du processus réel.',
  keyPoints: ['Départ', 'Arrivée'],
  teachingObjective: 'Cartographier un processus réel sans proposer de solution.',
  estimatedDuration: 180,
  order: 1,
};

describe('syllabus validation', () => {
  it('rejects every sequence missing its objective or duration', () => {
    const issues = getSyllabusValidationIssues(syllabus, [
      { ...outline, teachingObjective: undefined },
      { ...outline, id: 'scene_2', order: 2, estimatedDuration: undefined },
    ]);

    expect(issues).toEqual([
      { field: 'sceneObjective', sceneIndex: 0 },
      { field: 'sceneDuration', sceneIndex: 1 },
    ]);
  });

  it('accepts a complete syllabus and complete sequences', () => {
    expect(getSyllabusValidationIssues(syllabus, [outline])).toEqual([]);
  });
});

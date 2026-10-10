import { describe, expect, it } from 'vitest';
import { getSyllabusDurationGap } from '@/lib/generation/syllabus-validation';
import type { ClassroomSyllabus, SceneOutline } from '@/lib/types/generation';

function syllabus(totalDurationMinutes: number): ClassroomSyllabus {
  return {
    audience: 'Ingénieurs',
    prerequisites: 'Aucun',
    overallObjective: 'Objectif',
    learningObjectives: ['Objectif'],
    totalDurationMinutes,
    deliveryMode: 'Hybride',
    assessmentStrategy: 'Quiz',
    expectedDeliverable: 'Plan d’action',
  };
}

function outlines(...secondsPerScene: number[]): SceneOutline[] {
  return secondsPerScene.map(
    (estimatedDuration, index) =>
      ({
        id: `scene-${index + 1}`,
        type: 'slide',
        title: `Séquence ${index + 1}`,
        description: 'Description',
        keyPoints: [],
        order: index + 1,
        estimatedDuration,
      }) as SceneOutline,
  );
}

describe('getSyllabusDurationGap', () => {
  it('signale les séquences de 96 min face aux 210 min annoncées', () => {
    expect(getSyllabusDurationGap(syllabus(210), outlines(5760))).toEqual({
      sequencesMinutes: 96,
      totalMinutes: 210,
    });
  });

  it('ne signale rien quand les séquences atteignent la durée annoncée à 10 % près', () => {
    expect(getSyllabusDurationGap(syllabus(210), outlines(12000))).toBeNull();
    expect(getSyllabusDurationGap(syllabus(60), outlines(3600))).toBeNull();
  });

  it('ne signale rien sans séquence ni durée exploitable', () => {
    expect(getSyllabusDurationGap(syllabus(210), [])).toBeNull();
    expect(getSyllabusDurationGap(syllabus(0), outlines(600))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  getSyllabusDurationGap,
  redistributeSceneDurations,
} from '@/lib/generation/syllabus-validation';
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

describe('redistributeSceneDurations', () => {
  const total = (items: SceneOutline[]) =>
    items.reduce((sum, item) => sum + (item.estimatedDuration ?? 0), 0);

  it('rescales every sequence so that together they last exactly the announced total', () => {
    const scaled = redistributeSceneDurations(outlines(900, 600, 300), 210);
    expect(total(scaled)).toBe(210 * 60);
    expect(scaled[0].estimatedDuration).toBeGreaterThan(scaled[1].estimatedDuration ?? 0);
    expect(scaled[1].estimatedDuration).toBeGreaterThan(scaled[2].estimatedDuration ?? 0);
    expect(getSyllabusDurationGap(syllabus(210), scaled)).toBeNull();
  });

  it('keeps the relative weights and absorbs rounding on the longest sequence', () => {
    const scaled = redistributeSceneDurations(outlines(100, 100, 100), 1);
    expect(total(scaled)).toBe(60);
    expect(scaled.map((item) => item.estimatedDuration)).toEqual([20, 20, 20]);
    const odd = redistributeSceneDurations(outlines(100, 100, 100), 2);
    expect(total(odd)).toBe(120);
  });

  it('gives an average duration to sequences that had none and ignores invalid totals', () => {
    const scaled = redistributeSceneDurations(outlines(600, 0), 20);
    expect(total(scaled)).toBe(1200);
    expect(scaled[1].estimatedDuration).toBe(600);
    const untouched = outlines(600, 300);
    expect(redistributeSceneDurations(untouched, 0)).toBe(untouched);
  });
});

import { describe, expect, it } from 'vitest';
import {
  diffPlans,
  isPlanUnchanged,
  outlineSignature,
  reconcileScenes,
  regenerationCount,
  toLearnerPlan,
} from '@/lib/syllabus/plan-diff';
import type { ClassroomPlan, SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';

const outline = (id: string, order: number, extra: Partial<SceneOutline> = {}): SceneOutline => ({
  id,
  type: 'slide',
  title: `Titre ${id}`,
  description: `Description ${id}`,
  keyPoints: ['a', 'b'],
  order,
  ...extra,
});

const sceneFor = (order: number): Scene =>
  ({
    id: `scene-${order}`,
    stageId: 's',
    type: 'slide',
    title: `S${order}`,
    order,
    content: { type: 'slide' },
  }) as unknown as Scene;

const base = [outline('a', 1), outline('b', 2), outline('c', 3)];

describe('diffPlans', () => {
  it('ne signale rien quand le plan est identique', () => {
    const diff = diffPlans(
      base,
      base.map((o) => ({ ...o })),
    );
    expect(isPlanUnchanged(diff)).toBe(true);
    expect(diff.unchanged).toHaveLength(3);
  });

  it('distingue ajout, suppression, modification et déplacement', () => {
    const next = [
      outline('c', 1),
      outline('a', 2, { description: 'Nouvelle description' }),
      outline('d', 3),
    ];
    const diff = diffPlans(base, next);
    expect(diff.added.map((o) => o.id)).toEqual(['d']);
    expect(diff.removed.map((o) => o.id)).toEqual(['b']);
    expect(diff.modified.map((o) => o.id)).toEqual(['a']);
    expect(diff.moved.map((o) => o.id)).toEqual(['c']);
    expect(regenerationCount(diff)).toBe(2);
  });

  it("ignore l'ordre, les médias et les ressources dans l'empreinte", () => {
    const withMedia = outline('a', 9, { suggestedImageIds: ['img_1'] });
    expect(outlineSignature(withMedia)).toBe(outlineSignature(outline('a', 1)));
  });

  it("l'ordre des clés ne change pas l'empreinte", () => {
    const a = outline('a', 1, {
      quizConfig: { questionCount: 3, difficulty: 'easy', questionTypes: ['single'] },
    });
    const b = outline('a', 1, {
      quizConfig: { difficulty: 'easy', questionTypes: ['single'], questionCount: 3 },
    });
    expect(outlineSignature(a)).toBe(outlineSignature(b));
  });
});

describe('reconcileScenes', () => {
  const scenes = [sceneFor(1), sceneFor(2), sceneFor(3)];

  it('conserve et renumérote les scènes inchangées, génère les ajoutées et modifiées, retire les supprimées', () => {
    const next = [outline('c', 1), outline('a', 2, { title: 'Titre modifié' }), outline('d', 3)];
    const result = reconcileScenes({ previous: base, next, scenes });
    expect(result.outlines.map((o) => [o.id, o.order])).toEqual([
      ['c', 1],
      ['a', 2],
      ['d', 3],
    ]);
    expect(result.keptScenes.map((s) => [s.id, s.order])).toEqual([['scene-3', 1]]);
    expect(result.pending.map((o) => o.id)).toEqual(['a', 'd']);
    expect(result.orphaned).toEqual([]);
  });

  it('ne régénère jamais une entrée inchangée dont la scène a été supprimée à la main', () => {
    const result = reconcileScenes({
      previous: base,
      next: base,
      scenes: [sceneFor(1), sceneFor(3)],
    });
    expect(result.orphaned.map((o) => o.id)).toEqual(['b']);
    expect(result.pending).toEqual([]);
    expect(result.outlines.map((o) => [o.id, o.order])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
    expect(result.keptScenes.map((s) => [s.id, s.order])).toEqual([
      ['scene-1', 1],
      ['scene-3', 2],
    ]);
  });

  it('suit le rang réel des scènes quand il diffère de celui du plan', () => {
    const result = reconcileScenes({
      previous: base,
      next: base,
      scenes: [sceneFor(10), sceneFor(20), sceneFor(30)],
      sceneOrderOf: (o) => o.order * 10,
    });
    expect(result.keptScenes.map((s) => [s.id, s.order])).toEqual([
      ['scene-10', 1],
      ['scene-20', 2],
      ['scene-30', 3],
    ]);
  });
});

describe('toLearnerPlan', () => {
  it('ne garde que le programme et le déroulé', () => {
    const plan = {
      courseTitle: 'Titre',
      languageDirective: 'Français',
      optimization: { secret: true },
      designDirective: { secret: true },
      syllabus: {
        audience: 'a',
        prerequisites: 'b',
        overallObjective: 'c',
        learningObjectives: ['d'],
        totalDurationMinutes: 10,
        deliveryMode: 'e',
        assessmentStrategy: 'f',
        expectedDeliverable: 'g',
      },
      outlines: [
        outline('b', 2, { mediaGenerations: [{ type: 'image', prompt: 'p', elementId: 'x' }] }),
        outline('a', 1, {
          quizConfig: { questionCount: 3, difficulty: 'easy', questionTypes: ['single'] },
        }),
      ],
    } as unknown as ClassroomPlan;
    const view = toLearnerPlan(plan);
    expect(view.outlines.map((o) => o.id)).toEqual(['a', 'b']);
    expect(JSON.stringify(view)).not.toMatch(/secret|mediaGenerations|quizConfig|Français/);
  });
});

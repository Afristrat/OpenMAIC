import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStageStore } from '@/lib/store/stage';
import type { Scene, Stage } from '@/lib/types/stage';

vi.mock('@/lib/utils/stage-storage', () => ({
  saveStageData: vi.fn().mockResolvedValue(undefined),
  loadStageData: vi.fn().mockResolvedValue(null),
}));

describe('stage market context update', () => {
  beforeEach(() => {
    useStageStore.getState().clearStore();
  });

  it('met à jour le contexte sans effacer les scènes ni la sélection courante', () => {
    const stage = {
      id: 'course-1',
      name: 'Formation existante',
      learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
    } as Stage;
    const scene = {
      id: 'scene-1',
      stageId: stage.id,
      type: 'slide',
      title: 'Budget',
      order: 1,
      content: { type: 'slide', canvas: { elements: [] } },
      actions: [],
    } as unknown as Scene;
    useStageStore.getState().setStage(stage);
    useStageStore.getState().setScenes([scene]);

    useStageStore.getState().updateStage({
      learningContext: { territory: 'France', currencyCode: 'EUR' },
    });

    const state = useStageStore.getState();
    expect(state.stage?.learningContext).toEqual({ territory: 'France', currencyCode: 'EUR' });
    expect(state.scenes.map(({ id }) => id)).toEqual(['scene-1']);
    expect(state.currentSceneId).toBe('scene-1');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  stagePut: vi.fn(),
  sceneDelete: vi.fn(),
  sceneBulkPut: vi.fn(),
  saveChats: vi.fn(),
}));

vi.mock('@/lib/utils/database', () => ({
  db: {
    stages: { put: mocks.stagePut },
    scenes: {
      where: () => ({ equals: () => ({ delete: mocks.sceneDelete }) }),
      bulkPut: mocks.sceneBulkPut,
    },
    transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/utils/chat-storage', () => ({
  saveChatSessions: mocks.saveChats,
  loadChatSessions: vi.fn(),
  deleteChatSessions: vi.fn(),
}));
vi.mock('@/lib/utils/playback-storage', () => ({ clearPlaybackState: vi.fn() }));
vi.mock('@/lib/quiz/persistence', () => ({ clearAllForScene: vi.fn() }));

import {
  resolveCurrentSceneId,
  saveStageData,
  type StageStoreData,
} from '@/lib/utils/stage-storage';

describe('resolveCurrentSceneId', () => {
  const scenes = [{ id: 'scene-1' }, { id: 'scene-2' }];

  it('preserves a valid selection and otherwise falls back to the first scene', () => {
    expect(resolveCurrentSceneId(scenes, 'scene-2')).toBe('scene-2');
    expect(resolveCurrentSceneId(scenes, 'deleted-scene')).toBe('scene-1');
    expect(resolveCurrentSceneId([], 'deleted-scene')).toBeNull();
  });
});

describe('saveStageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (_mode: string, _tables: unknown[], operation: () => Promise<void>) => operation(),
    );
    mocks.stagePut.mockResolvedValue(undefined);
    mocks.sceneDelete.mockResolvedValue(undefined);
    mocks.sceneBulkPut.mockResolvedValue(undefined);
    mocks.saveChats.mockResolvedValue(undefined);
  });

  it('replaces the stage and all of its scenes in one IndexedDB transaction', async () => {
    await saveStageData('course-1', {
      stage: { id: 'course-1', name: 'Cours', createdAt: 1, updatedAt: 1 },
      scenes: [
        {
          id: 'scene-1',
          stageId: 'course-1',
          type: 'slide',
          title: 'Introduction',
          order: 1,
          content: { type: 'slide', schemaVersion: 1, canvas: { id: 'slide-1', elements: [] } },
          createdAt: 1,
          updatedAt: 1,
        } as unknown as StageStoreData['scenes'][number],
      ],
      currentSceneId: 'scene-1',
      chats: [],
    });

    expect(mocks.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining([expect.anything(), expect.anything()]),
      expect.any(Function),
    );
    expect(mocks.stagePut).toHaveBeenCalledOnce();
    expect(mocks.sceneDelete).toHaveBeenCalledOnce();
    expect(mocks.sceneBulkPut).toHaveBeenCalledOnce();
    expect(mocks.sceneBulkPut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveChats.mock.invocationCallOrder[0],
    );
  });
});

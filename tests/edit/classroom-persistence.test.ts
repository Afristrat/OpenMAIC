import { describe, expect, it, vi } from 'vitest';
import { ClassroomPersistence, hasUnsyncedClassroom } from '@/lib/edit/classroom-persistence';
import type { StageStoreData } from '@/lib/utils/stage-storage';

function snapshot(name: string): StageStoreData {
  return {
    stage: { id: 'course-1', name, createdAt: 1, updatedAt: 1 },
    scenes: [],
    currentSceneId: null,
    chats: [],
  };
}

function markerStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ClassroomPersistence', () => {
  it('serializes remote revisions so an older PUT cannot finish after a newer one', async () => {
    const first = deferred();
    const saveRemote = vi
      .fn<(data: StageStoreData, revision: number) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const controller = new ClassroomPersistence({
      stageId: 'course-1',
      markerStorage: markerStorage(),
      debounceMs: 60_000,
      saveLocal: vi.fn().mockResolvedValue(undefined),
      saveRemote,
    });

    controller.schedule(snapshot('revision 1'));
    const flushed = controller.flush();
    await vi.waitFor(() => expect(saveRemote).toHaveBeenCalledTimes(1));
    controller.schedule(snapshot('revision 2'));
    const secondFlush = controller.flush();
    expect(saveRemote).toHaveBeenCalledTimes(1);

    first.resolve();
    await expect(flushed).resolves.toBe(true);
    await expect(secondFlush).resolves.toBe(true);
    expect(saveRemote.mock.calls.map(([data, revision]) => [data.stage.name, revision])).toEqual([
      ['revision 1', 1],
      ['revision 2', 2],
    ]);
  });

  it('keeps the durable marker on failure and clears it only after retry succeeds', async () => {
    const storage = markerStorage();
    const saveRemote = vi
      .fn<(data: StageStoreData, revision: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const controller = new ClassroomPersistence({
      stageId: 'course-1',
      markerStorage: storage,
      debounceMs: 60_000,
      saveLocal: vi.fn().mockResolvedValue(undefined),
      saveRemote,
    });

    controller.schedule(snapshot('local edit'));
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.state).toBe('error');
    expect(hasUnsyncedClassroom('course-1', storage)).toBe(true);

    await expect(controller.flush()).resolves.toBe(true);
    expect(controller.state).toBe('saved');
    expect(hasUnsyncedClassroom('course-1', storage)).toBe(false);
  });

  it('does not let a local cache failure block the durable remote save', async () => {
    const storage = markerStorage();
    const saveRemote = vi.fn().mockResolvedValue(undefined);
    const saveLocal = vi
      .fn<(data: StageStoreData) => Promise<void>>()
      .mockRejectedValue(new Error('IndexedDB unavailable'));
    const controller = new ClassroomPersistence({
      stageId: 'course-1',
      markerStorage: storage,
      debounceMs: 60_000,
      saveLocal,
      saveRemote,
    });

    controller.schedule(snapshot('not durable'));
    await expect(controller.flush()).resolves.toBe(true);
    expect(saveLocal).toHaveBeenCalledOnce();
    expect(saveRemote).toHaveBeenCalledOnce();
    expect(controller.state).toBe('saved');
    expect(hasUnsyncedClassroom('course-1', storage)).toBe(false);
  });
});

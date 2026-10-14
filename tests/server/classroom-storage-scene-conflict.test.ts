import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';

const state = vi.hoisted(() => ({
  foreignSceneIds: [] as string[],
  upserts: [] as string[],
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/agents/classroom-casting', () => ({ normalizeClassroomCasting: () => undefined }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        in: () => builder,
        neq: () =>
          Promise.resolve({ data: state.foreignSceneIds.map((id) => ({ id })), error: null }),
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        upsert: () => {
          state.upserts.push(table);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  }),
}));

import { ClassroomSceneConflictError, persistClassroom } from '@/lib/server/classroom-storage';

const stage = { id: 'stage-a', name: 'A' } as Stage;
const scenes = [
  { id: 'scene-1', stageId: 'stage-a', type: 'slide', order: 1 },
] as unknown as Scene[];
const input = { id: 'stage-a', stage, scenes, ownerId: 'u1', orgId: 'o1' };

describe('persistClassroom scene ownership', () => {
  beforeEach(() => {
    state.foreignSceneIds = [];
    state.upserts = [];
  });

  it('refuse un id de scène appartenant à une autre classroom, sans aucune écriture', async () => {
    state.foreignSceneIds = ['scene-1'];
    await expect(persistClassroom(input, 'https://qalem.ma')).rejects.toBeInstanceOf(
      ClassroomSceneConflictError,
    );
    expect(state.upserts).toEqual([]);
  });
});

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => {
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        mocks.eq(...args);
        return query;
      },
      limit: () => query,
      maybeSingle: async () => mocks.result,
    };
    return { from: () => query };
  },
}));
import { isClassroomPublic } from '@/lib/server/classroom-storage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: null, error: null };
});
it('requires an explicitly verified public share', async () => {
  expect(await isClassroomPublic('shared-stage')).toBe(false);
  expect(mocks.eq).toHaveBeenCalledWith('authorization_verified', true);
  expect(mocks.eq).toHaveBeenCalledWith('organizations.status', 'active');
  expect(mocks.eq).toHaveBeenCalledWith('visibility', 'public');
  expect(mocks.eq).toHaveBeenCalledWith('stage_id', 'shared-stage');
  mocks.result.data = { id: 'verified-share' };
  expect(await isClassroomPublic('shared-stage')).toBe(true);
});
it('does not mistake a failed lookup for approval', async () => {
  mocks.result.error = { message: 'unavailable' };
  await expect(isClassroomPublic('shared-stage')).rejects.toThrow('visibility');
});

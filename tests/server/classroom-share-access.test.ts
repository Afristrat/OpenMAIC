import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  filters: vi.fn(),
  from: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => {
    const query = {
      select: (value: string) => {
        mocks.filters('select', value);
        return query;
      },
      eq: (...args: unknown[]) => {
        mocks.filters(...args);
        return query;
      },
      in: (...args: unknown[]) => {
        mocks.filters(...args);
        return query;
      },
      limit: () => query,
      maybeSingle: async () => mocks.result,
    };
    return {
      auth: { getUser: mocks.getUser },
      from: (...args: unknown[]) => {
        mocks.from(...args);
        return query;
      },
    };
  },
}));
import { hasClassroomShareAccess } from '@/lib/server/classroom-share-access';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: { id: 'share' }, error: null };
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
});
it('requires a verified share, active recipient and the authenticated membership', async () => {
  expect(await hasClassroomShareAccess('stage', 'recipient')).toBe(true);
  for (const filter of [
    ['stage_id', 'stage'],
    ['org_id', 'recipient'],
    ['authorization_verified', true],
    ['organizations.status', 'active'],
    ['organizations.org_members.user_id', 'verified-user'],
  ]) {
    expect(mocks.filters).toHaveBeenCalledWith(...filter);
  }
  expect(mocks.filters).toHaveBeenCalledWith('visibility', ['organization', 'public']);
});
it('does not query shares without an authenticated actor', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await hasClassroomShareAccess('stage')).toBe(false);
  expect(mocks.from).not.toHaveBeenCalled();
});
it('denies absent grants and throws on failed verification', async () => {
  mocks.result.data = null;
  expect(await hasClassroomShareAccess('stage')).toBe(false);
  mocks.result.error = { message: 'offline' };
  await expect(hasClassroomShareAccess('stage')).rejects.toThrow('verification unavailable');
});

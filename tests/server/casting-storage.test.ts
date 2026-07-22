import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'castings') throw new Error(`Unexpected table: ${table}`);
      return { insert: mocks.insert };
    },
  }),
}));

import { reserveCasting } from '@/lib/server/casting-storage';

describe('casting storage', () => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.select.mockReset();
    mocks.single.mockReset();
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it('turns the database unique violation into a redraw signal', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      reserveCasting({
        userId: 'user-1',
        courseId: 'd5a654f0-8b17-5065-a8c1-a87ca69ce517',
        lineup: [{ id: 'persona-professor' }],
        lineupHash: 'lineup-1',
      }),
    ).resolves.toBeNull();
  });
});

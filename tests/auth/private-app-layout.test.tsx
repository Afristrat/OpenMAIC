import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import PrivateApplicationLayout from '@/app/app/layout';

describe('private application layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_E2E_TEST_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns authenticated application content', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } });

    await expect(PrivateApplicationLayout({ children: 'private' })).resolves.toBe('private');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated request before rendering application content', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(PrivateApplicationLayout({ children: 'private' })).rejects.toThrow(
      'REDIRECT:/auth?next=/app',
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/auth?next=/app');
  });
});

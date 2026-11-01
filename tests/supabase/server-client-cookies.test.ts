import { beforeEach, describe, expect, it, vi } from 'vitest';

type CookieAdapter = {
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  adapter: null as CookieAdapter | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: mocks.set }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieAdapter }) => {
    mocks.adapter = options.cookies;
    return {};
  },
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';

describe('createServerSupabaseClient cookie writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    mocks.adapter = null;
  });

  it('writes the refreshed session cookies when the context allows it', async () => {
    await createServerSupabaseClient();

    mocks.adapter?.setAll([{ name: 'sb-db-auth-token', value: 'v', options: { path: '/' } }]);

    expect(mocks.set).toHaveBeenCalledWith('sb-db-auth-token', 'v', { path: '/' });
  });

  it('does not throw when Next forbids the write during a Server Component render', async () => {
    mocks.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    });
    await createServerSupabaseClient();

    expect(() =>
      mocks.adapter?.setAll([{ name: 'sb-db-auth-token', value: 'v', options: {} }]),
    ).not.toThrow();
  });
});

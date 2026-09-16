import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.createBrowserClient,
  createServerClient: mocks.createServerClient,
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

import { createClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

describe('Supabase SSR session cookie', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.qalem.ma';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_INTERNAL_URL = 'http://qalem-internal-kong:8000';
    mocks.createBrowserClient.mockReset();
    mocks.createServerClient.mockReset();
    mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  });

  it('keeps browser and private-server clients on the public session key', async () => {
    createClient();
    await createServerSupabaseClient();

    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      'https://db.qalem.ma',
      'test-anon-key',
      expect.objectContaining({ cookieOptions: { name: 'sb-db-auth-token' } }),
    );
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      'http://qalem-internal-kong:8000',
      'test-anon-key',
      expect.objectContaining({ cookieOptions: { name: 'sb-db-auth-token' } }),
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { createServiceSupabaseClient } from '@/lib/supabase/service';

describe('service client request cancellation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  function options(signal?: AbortSignal) {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-test-key');
    createServiceSupabaseClient(signal);
    return mocks.createClient.mock.calls.at(-1)![2];
  }
  it('leaves existing clients without a global deadline', () => {
    expect(options().global).toBeUndefined();
  });
  it.each(['client', 'init', 'request'] as const)(
    'preserves cancellation from %s',
    async (source) => {
      const client = new AbortController();
      const operation = new AbortController();
      const fetchMock = vi.fn().mockResolvedValue(new Response());
      vi.stubGlobal('fetch', fetchMock);
      const input =
        source === 'request'
          ? new Request('https://example.test', { signal: operation.signal })
          : 'https://example.test';
      await options(client.signal).global.fetch(
        input,
        source === 'init' ? { signal: operation.signal } : undefined,
      );
      const forwarded = fetchMock.mock.calls[0][1].signal as AbortSignal;
      expect(forwarded.aborted).toBe(false);
      (source === 'client' ? client : operation).abort();
      expect(forwarded.aborted).toBe(true);
    },
  );
});

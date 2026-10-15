import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  validateWebhookUrl: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  configs: [] as Array<{ id: string; url: string; secret: string }>,
}));

vi.mock('@/lib/server/ssrf-guard', async () => {
  class SsrfBlockedError extends Error {}
  class SafeFetchRedirectError extends Error {}
  return { safeFetch: mocks.safeFetch, SsrfBlockedError, SafeFetchRedirectError };
});
vi.mock('@/lib/webhooks/url-guard', () => ({ validateWebhookUrl: mocks.validateWebhookUrl }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'webhook_deliveries') {
        return {
          insert: async (row: Record<string, unknown>) => {
            mocks.inserted.push(row);
            return { error: null };
          },
        };
      }
      const query = {
        select: () => query,
        eq: () => query,
        contains: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: mocks.configs, error: null }),
      };
      return query;
    },
  }),
}));

function endlessBody(onCancel: () => void): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(16 * 1024).fill(120);
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(chunk);
    },
    cancel() {
      onCancel();
    },
  });
}

describe('dispatchWebhook', () => {
  const nativeFetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mocks.safeFetch.mockReset();
    mocks.validateWebhookUrl.mockReset().mockResolvedValue(null);
    mocks.inserted.length = 0;
    mocks.configs = [{ id: 'wh-1', url: 'https://hooks.example.com/in', secret: 's3cret' }];
    nativeFetch.mockReset();
    vi.stubGlobal('fetch', nativeFetch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('livre via safeFetch (jamais le fetch natif), sans suivre de redirection', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    mocks.safeFetch.mockResolvedValue({
      response: new Response('ok', { status: 200 }),
      finalUrl: 'https://hooks.example.com/in',
      dispose,
    });
    const { dispatchWebhook } = await import('@/lib/webhooks/dispatcher');
    await dispatchWebhook('classroom.completed' as never, { a: 1 }, 'org-1');

    expect(nativeFetch).not.toHaveBeenCalled();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    const [url, init, options] = mocks.safeFetch.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/in');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(options).toMatchObject({ maxRedirects: 0 });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mocks.inserted[0]).toMatchObject({ status_code: 200, response_body: 'ok', attempt: 1 });
  });

  it('plafonne response_body à 64 Kio et annule un flux sans fin', async () => {
    const cancel = vi.fn();
    const dispose = vi.fn().mockResolvedValue(undefined);
    mocks.safeFetch.mockResolvedValue({
      response: new Response(endlessBody(cancel), { status: 200 }),
      finalUrl: 'https://hooks.example.com/in',
      dispose,
    });
    const { dispatchWebhook } = await import('@/lib/webhooks/dispatcher');
    await dispatchWebhook('classroom.completed' as never, {}, 'org-1');

    const stored = mocks.inserted[0].response_body as string;
    expect(stored.length).toBeLessThanOrEqual(64 * 1024);
    expect(stored.length).toBeGreaterThan(60 * 1024);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('enregistre un échec (sans retomber sur le fetch natif) quand safeFetch refuse la cible', async () => {
    vi.useFakeTimers();
    const { SsrfBlockedError } = await import('@/lib/server/ssrf-guard');
    mocks.safeFetch.mockRejectedValue(
      new SsrfBlockedError('Local/private network URLs are not allowed'),
    );
    const { dispatchWebhook } = await import('@/lib/webhooks/dispatcher');
    const done = dispatchWebhook('classroom.completed' as never, {}, 'org-1');
    await vi.runAllTimersAsync();
    await done;

    expect(nativeFetch).not.toHaveBeenCalled();
    expect(mocks.inserted).toHaveLength(3);
    expect(mocks.inserted[0]).toMatchObject({
      status_code: null,
      response_body: 'Local/private network URLs are not allowed',
    });
  });

  it('ne contacte rien quand la validation initiale (https en production) refuse l’URL', async () => {
    vi.useFakeTimers();
    mocks.validateWebhookUrl.mockResolvedValue('Webhook URLs must use HTTPS in production');
    const { dispatchWebhook } = await import('@/lib/webhooks/dispatcher');
    const done = dispatchWebhook('classroom.completed' as never, {}, 'org-1');
    await vi.runAllTimersAsync();
    await done;
    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(mocks.inserted[0].response_body).toMatch(/HTTPS/);
  });
});

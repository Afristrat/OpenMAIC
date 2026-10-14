import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validateUrlForSSRF: vi.fn() }));
vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.validateUrlForSSRF }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { validateWebhookUrl } from '@/lib/webhooks/url-guard';

describe('validateWebhookUrl', () => {
  beforeEach(() => {
    mocks.validateUrlForSSRF.mockReset();
    mocks.validateUrlForSSRF.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuse http en production sans consulter la garde SSRF', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await validateWebhookUrl('http://hooks.example.com/x')).toMatch(/HTTPS/);
    expect(mocks.validateUrlForSSRF).not.toHaveBeenCalled();
  });

  it('accepte http hors production, sous réserve de la garde SSRF', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(await validateWebhookUrl('http://hooks.example.com/x')).toBeNull();
    expect(mocks.validateUrlForSSRF).toHaveBeenCalledWith('http://hooks.example.com/x');
  });

  it('propage le refus de la garde SSRF', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.validateUrlForSSRF.mockResolvedValue('Local/private network URLs are not allowed');
    expect(await validateWebhookUrl('https://169.254.169.254/latest')).toMatch(/private/);
  });

  it('refuse une URL invalide', async () => {
    expect(await validateWebhookUrl('pas une url')).toBe('Invalid URL');
  });
});

describe('dispatchWebhook revalide avant livraison', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('ne fait aucun fetch quand la garde refuse et utilise redirect manual sinon', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const insert = vi.fn().mockResolvedValue({});
    const configs = [{ id: 'w1', url: 'https://hooks.example.com/x', secret: 's' }];
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceSupabaseClient: () => ({
        from: (table: string) =>
          table === 'webhook_configs'
            ? {
                select: () => ({
                  eq: () => ({
                    contains: () => Promise.resolve({ data: configs, error: null }),
                  }),
                }),
              }
            : { insert },
      }),
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.validateUrlForSSRF.mockReset();

    const { dispatchWebhook } = await import('@/lib/webhooks/dispatcher');
    const event = (await import('@/lib/webhooks/types')).WEBHOOK_EVENTS[0];

    mocks.validateUrlForSSRF.mockResolvedValue(null);
    await dispatchWebhook(event, { a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });

    fetchMock.mockClear();
    mocks.validateUrlForSSRF.mockResolvedValue('Local/private network URLs are not allowed');
    const pending = dispatchWebhook(event, { a: 1 });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

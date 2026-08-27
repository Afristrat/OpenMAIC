import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteSubscription: vi.fn(),
  getPublicKey: vi.fn(),
  saveSubscription: vi.fn(),
  send: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/server/web-push', () => ({
  deleteWebPushSubscription: mocks.deleteSubscription,
  getWebPushPublicKey: mocks.getPublicKey,
  saveWebPushSubscription: mocks.saveSubscription,
  sendWebPushToUser: mocks.send,
  validateBrowserPushSubscription: (value: { endpoint?: string } | null) =>
    value?.endpoint?.startsWith('https://') ? value : null,
  WebPushConfigurationError: class WebPushConfigurationError extends Error {},
  WebPushSubscriptionConflictError: class WebPushSubscriptionConflictError extends Error {},
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: mocks.maybeSingle,
      };
      return chain;
    },
  }),
}));

import { POST as saveSubscription } from '@/app/api/push-subscriptions/route';
import { POST as sendTestPush } from '@/app/api/push-test/route';

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Web Push APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user-a', email: 'a@example.test' } });
    mocks.getPublicKey.mockReturnValue('B'.repeat(87));
  });

  it('rejects a malformed browser subscription before storage', async () => {
    const response = await saveSubscription(
      request('/api/push-subscriptions', { endpoint: 'http://unsafe.example' }),
    );

    expect(response.status).toBe(400);
    expect(mocks.saveSubscription).not.toHaveBeenCalled();
  });

  it('sends a test notification only to a review card owned by the caller', async () => {
    const cardId = '11111111-1111-4111-8111-111111111111';
    mocks.maybeSingle.mockResolvedValue({ data: { id: cardId }, error: null });
    mocks.send.mockResolvedValue([
      { subscriptionId: 'subscription-a', status: 'accepted', pushServiceStatus: 201 },
    ]);

    const response = await sendTestPush(request('/api/push-test', { cardId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: 1 });
    expect(mocks.send).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ targetUrl: `/review?card=${cardId}` }),
    );
  });

  it('selects the caller’s next due card for the settings test button', async () => {
    const cardId = '22222222-2222-4222-8222-222222222222';
    mocks.maybeSingle.mockResolvedValue({ data: { id: cardId }, error: null });
    mocks.send.mockResolvedValue([
      { subscriptionId: 'subscription-a', status: 'accepted', pushServiceStatus: 201 },
    ]);

    const response = await sendTestPush(request('/api/push-test', {}));

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ targetUrl: `/review?card=${cardId}` }),
    );
  });

  it('does not send when the requested card is not owned by the caller', async () => {
    const cardId = '11111111-1111-4111-8111-111111111111';
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await sendTestPush(request('/api/push-test', { cardId }));

    expect(response.status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reports an upstream failure when no push service accepts the message', async () => {
    const cardId = '11111111-1111-4111-8111-111111111111';
    mocks.maybeSingle.mockResolvedValue({ data: { id: cardId }, error: null });
    mocks.send.mockResolvedValue([
      { subscriptionId: 'subscription-a', status: 'failed', pushServiceStatus: 503 },
    ]);

    const response = await sendTestPush(request('/api/push-test', { cardId }));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      success: false,
      errorCode: 'UPSTREAM_ERROR',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

import {
  sendWebPushToUser,
  validateBrowserPushSubscription,
  validateWebPushTarget,
} from '@/lib/server/web-push';

const subscriptions = [
  { id: 'subscription-a', endpoint: 'https://push.example/a', p256dh: 'p'.repeat(65), auth: 'a'.repeat(22) },
  { id: 'subscription-b', endpoint: 'https://push.example/b', p256dh: 'q'.repeat(65), auth: 'b'.repeat(22) },
];

function installDatabaseMock() {
  const writes: Array<{ table: string; operation: string; value?: unknown }> = [];
  mocks.from.mockImplementation((table: string) => {
    let operation = '';
    const chain = {
      select: vi.fn(() => {
        operation = 'select';
        return chain;
      }),
      update: vi.fn((value: unknown) => {
        operation = 'update';
        writes.push({ table, operation, value });
        return chain;
      }),
      insert: vi.fn(async (value: unknown) => {
        writes.push({ table, operation: 'insert', value });
        return { error: null };
      }),
      delete: vi.fn(() => {
        operation = 'delete';
        writes.push({ table, operation });
        return chain;
      }),
      eq: vi.fn(() => chain),
      then: (resolve: (value: unknown) => void) =>
        resolve(
          operation === 'select'
            ? { data: subscriptions, error: null }
            : { data: null, error: null },
        ),
    };
    return chain;
  });
  return writes;
}

describe('Web Push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'B'.repeat(87));
    vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'p'.repeat(43));
    vi.stubEnv('WEB_PUSH_VAPID_SUBJECT', 'mailto:push@qalem.ma');
  });

  it('rejects unsafe subscriptions and notification targets at the trust boundary', () => {
    expect(
      validateBrowserPushSubscription({
        endpoint: 'https://push.example/subscription',
        expirationTime: null,
        keys: { p256dh: 'p'.repeat(65), auth: 'a'.repeat(22) },
      }),
    ).not.toBeNull();
    expect(
      validateBrowserPushSubscription({
        endpoint: 'http://push.example/subscription',
        expirationTime: null,
        keys: { p256dh: 'p'.repeat(65), auth: 'a'.repeat(22) },
      }),
    ).toBeNull();
    expect(validateWebPushTarget('/review?card=abc')).toBe(true);
    expect(validateWebPushTarget('//attacker.example')).toBe(false);
    expect(validateWebPushTarget('https://attacker.example')).toBe(false);
  });

  it('sends to every owned subscription, audits the result and removes expired endpoints', async () => {
    const writes = installDatabaseMock();
    mocks.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce({ statusCode: 410 });

    await expect(
      sendWebPushToUser('user-a', {
        title: 'Qalem',
        body: 'Une carte vous attend.',
        targetUrl: '/review?card=card-a',
      }),
    ).resolves.toEqual([
      { subscriptionId: 'subscription-a', status: 'accepted', pushServiceStatus: 201 },
      { subscriptionId: 'subscription-b', status: 'expired', pushServiceStatus: 410 },
    ]);

    expect(mocks.setVapidDetails).toHaveBeenCalledWith(
      'mailto:push@qalem.ma',
      'B'.repeat(87),
      'p'.repeat(43),
    );
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    expect(writes.filter(({ table, operation }) => table === 'web_push_deliveries' && operation === 'insert')).toHaveLength(2);
    expect(writes).toContainEqual({ table: 'push_subscriptions', operation: 'delete' });
  });
});

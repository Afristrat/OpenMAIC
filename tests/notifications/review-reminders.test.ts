import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  tryCreateClient: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  tryCreateClient: supabaseMocks.tryCreateClient,
}));

import {
  checkAndNotifyDueCards,
  loadPreferences,
  REVIEW_REMINDER_INTERVAL_MS,
  requestPushPermission,
  savePreferences,
  unsubscribeFromPush,
} from '@/lib/notifications';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const NOW = 2_000_000;

function serializedLocks(): LockManager {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: vi.fn((_name: string, callback: (lock: Lock | null) => unknown) => {
      const result = tail.then(() => callback({ name: _name, mode: 'exclusive' } as Lock));
      tail = result.catch(() => undefined);
      return result;
    }),
    query: vi.fn(),
  } as unknown as LockManager;
}

function installBrowser(permission: NotificationPermission = 'granted') {
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const subscription = {
    endpoint: 'https://push.example/subscription',
    toJSON: () => ({
      endpoint: 'https://push.example/subscription',
      expirationTime: null,
      keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  } as unknown as PushManager;
  const registration = { showNotification, pushManager } as unknown as ServiceWorkerRegistration;
  const notificationApi = {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  } as unknown as typeof Notification;
  const navigatorValue = {
    locks: serializedLocks(),
    onLine: true,
    serviceWorker: {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
    },
  } as unknown as Navigator;

  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('Notification', notificationApi);
  vi.stubGlobal('navigator', navigatorValue);
  vi.stubGlobal('window', { Notification: notificationApi, PushManager: class PushManager {} });

  return {
    navigatorValue,
    pushManager,
    requestPermission: notificationApi.requestPermission,
    showNotification,
    subscription,
  };
}

function installSupabase({
  authenticatedUser = 'user-a',
  dueCount = 1,
}: {
  authenticatedUser?: string;
  dueCount?: number;
} = {}) {
  const lte = vi.fn().mockResolvedValue({ count: dueCount, error: null });
  const eq = vi.fn().mockReturnValue({ lte });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: authenticatedUser } },
  });
  supabaseMocks.tryCreateClient.mockReturnValue({ auth: { getUser }, from });
  return { eq, from, getUser, lte, select };
}

describe('review reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies once when an authenticated user explicitly enabled push and has due cards', async () => {
    const { showNotification } = installBrowser();
    const query = installSupabase({ dueCount: 3 });
    savePreferences('user-a', { push: true });

    await expect(checkAndNotifyDueCards('user-a', () => NOW)).resolves.toBe('notified');

    expect(query.from).toHaveBeenCalledWith('review_cards');
    expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(query.lte).toHaveBeenCalledWith('due_date', new Date(NOW).toISOString());
    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledWith(
      'Qalem',
      expect.objectContaining({ tag: 'review-reminder' }),
    );
  });

  it('creates a real PushManager subscription and persists it for the authenticated account', async () => {
    const browser = installBrowser();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'B'.repeat(87) }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestPushPermission()).resolves.toBe(true);

    expect(browser.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/push-subscriptions');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/push-subscriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('replaces a subscription owned by the previous account without transferring ownership', async () => {
    const browser = installBrowser();
    vi.mocked(browser.pushManager.getSubscription).mockResolvedValue(browser.subscription);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'B'.repeat(87) }) })
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestPushPermission()).resolves.toBe(true);

    expect(browser.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(browser.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('unsubscribes the browser even when server cleanup is temporarily offline', async () => {
    const browser = installBrowser();
    vi.mocked(browser.pushManager.getSubscription).mockResolvedValue(browser.subscription);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(unsubscribeFromPush()).resolves.toBeUndefined();

    expect(browser.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('records a bounded successful check without notifying when no card is due', async () => {
    const { showNotification } = installBrowser();
    const query = installSupabase({ dueCount: 0 });
    savePreferences('user-a', { push: true });

    await expect(checkAndNotifyDueCards('user-a', () => NOW)).resolves.toBe('no-due-cards');
    await expect(checkAndNotifyDueCards('user-a', () => NOW + 1)).resolves.toBe('throttled');

    expect(query.from).toHaveBeenCalledOnce();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('does no network work without both an account preference and explicit permission', async () => {
    const grantedBrowser = installBrowser('granted');
    const query = installSupabase();

    await expect(checkAndNotifyDueCards('user-a', () => NOW)).resolves.toBe('disabled');
    expect(query.getUser).not.toHaveBeenCalled();
    expect(query.from).not.toHaveBeenCalled();
    expect(grantedBrowser.requestPermission).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    const undecidedBrowser = installBrowser('default');
    savePreferences('user-a', { push: true });
    await expect(checkAndNotifyDueCards('user-a', () => NOW)).resolves.toBe('disabled');
    expect(query.getUser).not.toHaveBeenCalled();
    expect(query.from).not.toHaveBeenCalled();
    expect(undecidedBrowser.requestPermission).not.toHaveBeenCalled();
  });

  it('keeps preferences and throttling isolated when the authenticated user changes', async () => {
    const { showNotification } = installBrowser();
    installSupabase({ authenticatedUser: 'user-b' });
    savePreferences('user-a', { push: true });

    expect(loadPreferences('user-a')).toEqual({ push: true });
    expect(loadPreferences('user-b')).toEqual({ push: false });
    await expect(checkAndNotifyDueCards('user-b', () => NOW)).resolves.toBe('disabled');

    savePreferences('user-b', { push: true });
    await expect(checkAndNotifyDueCards('user-b', () => NOW)).resolves.toBe('notified');
    expect(showNotification).toHaveBeenCalledOnce();
  });

  it('serializes concurrent tabs and displays no duplicate reminder', async () => {
    const { showNotification, navigatorValue } = installBrowser();
    const query = installSupabase({ dueCount: 2 });
    savePreferences('user-a', { push: true });

    const results = await Promise.all([
      checkAndNotifyDueCards('user-a', () => NOW),
      checkAndNotifyDueCards('user-a', () => NOW),
    ]);

    expect(results.sort()).toEqual(['notified', 'throttled']);
    expect(navigatorValue.locks?.request).toHaveBeenCalledTimes(2);
    expect(query.from).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledOnce();
  });

  it('aborts if the account changes while due cards are being queried', async () => {
    const { showNotification } = installBrowser();
    const query = installSupabase({ dueCount: 1 });
    query.getUser
      .mockResolvedValueOnce({ data: { user: { id: 'user-a' } } })
      .mockResolvedValueOnce({ data: { user: { id: 'user-b' } } });
    savePreferences('user-a', { push: true });

    await expect(checkAndNotifyDueCards('user-a', () => NOW)).resolves.toBe('unauthenticated');
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('checks again after the bounded interval expires', async () => {
    const { showNotification } = installBrowser();
    const query = installSupabase({ dueCount: 1 });
    savePreferences('user-a', { push: true });

    await checkAndNotifyDueCards('user-a', () => NOW);
    await checkAndNotifyDueCards('user-a', () => NOW + REVIEW_REMINDER_INTERVAL_MS);

    expect(query.from).toHaveBeenCalledTimes(2);
    expect(showNotification).toHaveBeenCalledTimes(2);
  });
});

/**
 * Browser notification manager for spaced-repetition reminders.
 *
 * Local reminders and authenticated Web Push subscription management.
 * Server-side email and WhatsApp preferences are merged by the settings UI.
 */

import { getClientTranslation } from '@/lib/i18n';
import { createLogger } from '@/lib/logger';
import { tryCreateClient } from '@/lib/supabase/client';

const log = createLogger('Notifications');

export interface NotificationPreferences {
  push: boolean;
}

export type DueCardCheckResult =
  | 'disabled'
  | 'throttled'
  | 'unauthenticated'
  | 'no-due-cards'
  | 'notified'
  | 'unavailable';

const PREFS_STORAGE_PREFIX = 'qalem-notification-prefs';
const LAST_CHECK_STORAGE_PREFIX = 'qalem-review-reminder-last-check';
const REMINDER_LOCK_PREFIX = 'qalem-review-reminder';
const SW_PATH = '/sw.js';
const PUSH_SUBSCRIPTION_PATH = '/api/push-subscriptions';

/** One successful check per authenticated user and browser every fifteen minutes. */
export const REVIEW_REMINDER_INTERVAL_MS = 15 * 60 * 1000;

function userStorageKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

function defaultPreferences(): NotificationPreferences {
  return { push: false };
}

/** Load notification preferences scoped to one authenticated account. */
export function loadPreferences(userId: string): NotificationPreferences {
  if (!userId) return defaultPreferences();

  try {
    const raw = localStorage.getItem(userStorageKey(PREFS_STORAGE_PREFIX, userId));
    if (!raw) return defaultPreferences();
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return { push: parsed.push === true };
  } catch {
    return defaultPreferences();
  }
}

/** Save notification preferences for exactly one authenticated account. */
export function savePreferences(userId: string, prefs: NotificationPreferences): void {
  if (!userId) return;

  try {
    localStorage.setItem(
      userStorageKey(PREFS_STORAGE_PREFIX, userId),
      JSON.stringify({ push: prefs.push === true }),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

/**
 * Request browser permission after an explicit user gesture.
 * The background reminder check never calls this function.
 */
function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function persistBrowserSubscription(subscription: PushSubscription): Promise<Response> {
  return fetch(PUSH_SUBSCRIPTION_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function requestPushPermission(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    log.warn('Push notifications are not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
      updateViaCache: 'none',
    });
    const keyResponse = await fetch(PUSH_SUBSCRIPTION_PATH);
    if (!keyResponse.ok) return false;
    const keyBody = (await keyResponse.json()) as { publicKey?: unknown };
    if (typeof keyBody.publicKey !== 'string') return false;

    const existing = await registration.pushManager.getSubscription();
    let subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(keyBody.publicKey),
      }));
    let created = !existing;
    let response = await persistBrowserSubscription(subscription);
    if (response.status === 409 && existing) {
      await existing.unsubscribe();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(keyBody.publicKey),
      });
      created = true;
      response = await persistBrowserSubscription(subscription);
    }
    if (!response.ok && created) await subscription.unsubscribe();
    return response.ok;
  } catch (error) {
    log.error('Failed to enable browser notifications:', error);
    return false;
  }
}

/** Return the current permission without ever prompting the user. */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported';
  }
  return Notification.permission;
}

/** Remove the current browser subscription locally and from the authenticated account. */
export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await fetch(PUSH_SUBSCRIPTION_PATH, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } finally {
      await subscription.unsubscribe();
    }
  } catch (error) {
    log.warn('Failed to disable browser notifications:', error);
  }
}

function readLastSuccessfulCheck(userId: string): number {
  try {
    const raw = localStorage.getItem(userStorageKey(LAST_CHECK_STORAGE_PREFIX, userId));
    const timestamp = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function rememberSuccessfulCheck(userId: string, timestamp: number): void {
  try {
    localStorage.setItem(userStorageKey(LAST_CHECK_STORAGE_PREFIX, userId), String(timestamp));
  } catch {
    // The notification tag still prevents two visible reminders if storage fails.
  }
}

async function withCrossTabLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!lockManager) return action();

  return lockManager.request(userStorageKey(REMINDER_LOCK_PREFIX, userId), action);
}

async function authenticatedUserId(): Promise<string | null> {
  const supabase = tryCreateClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Check due cards and display at most one local PWA reminder per interval.
 *
 * The account-scoped preference and an already-granted browser permission are
 * checked before any network request. Navigator Locks serializes concurrent
 * tabs; the account-scoped timestamp bounds later checks and the stable
 * notification tag replaces any residual duplicate at browser level.
 */
export async function checkAndNotifyDueCards(
  userId: string,
  now: () => number = Date.now,
): Promise<DueCardCheckResult> {
  if (!userId) return 'unauthenticated';
  if (!loadPreferences(userId).push || getPushPermissionState() !== 'granted') {
    return 'disabled';
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unavailable';
  }

  return withCrossTabLock(userId, async () => {
    const checkedAt = now();
    const lastCheckedAt = readLastSuccessfulCheck(userId);
    if (checkedAt >= lastCheckedAt && checkedAt - lastCheckedAt < REVIEW_REMINDER_INTERVAL_MS) {
      return 'throttled';
    }

    if ((await authenticatedUserId()) !== userId) return 'unauthenticated';

    const supabase = tryCreateClient();
    if (!supabase) return 'unavailable';

    try {
      const { count, error } = await supabase
        .from('review_cards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('due_date', new Date(checkedAt).toISOString());

      if (error || count === null) return 'unavailable';

      if (count === 0) {
        rememberSuccessfulCheck(userId, checkedAt);
        return 'no-due-cards';
      }

      // The user may have signed out or switched accounts while the query ran.
      if ((await authenticatedUserId()) !== userId) return 'unauthenticated';

      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Qalem', {
        body: getClientTranslation('notifications.reviewDue', { count }),
        icon: '/favicon.ico',
        tag: 'review-reminder',
        data: { url: '/review' },
      });
      rememberSuccessfulCheck(userId, checkedAt);
      return 'notified';
    } catch (error) {
      log.warn('Failed to check or display due-card reminder:', error);
      return 'unavailable';
    }
  });
}

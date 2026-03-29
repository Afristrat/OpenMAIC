/**
 * Notification manager for spaced-repetition review reminders.
 *
 * Supports three channels:
 * - Email (placeholder — requires backend integration)
 * - Push (PWA service worker)
 * - WhatsApp via Evolution API (placeholder — config structure only)
 */

import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('Notifications');

// ────────────────────────── Types ──────────────────────────

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  whatsapp: boolean;
  whatsappNumber?: string;
}

export interface EvolutionAPIConfig {
  /** Evolution API base URL (e.g. https://evo.example.com) */
  baseUrl: string;
  /** Instance name configured in Evolution API */
  instanceName: string;
  /** API key for the Evolution API instance */
  apiKey: string;
}

const PREFS_STORAGE_KEY = 'qalem-notification-prefs';

// ────────────────────────── Preferences ──────────────────────────

/** Load notification preferences from localStorage. */
export function loadPreferences(): NotificationPreferences {
  const defaults: NotificationPreferences = {
    email: false,
    push: false,
    whatsapp: false,
  };

  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
      return { ...defaults, ...parsed };
    }
  } catch {
    // localStorage unavailable or corrupt
  }

  return defaults;
}

/** Save notification preferences to localStorage. */
export function savePreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

// ────────────────────────── Push notifications ──────────────────────────

const SW_PATH = '/sw.js';

/**
 * Register the push notification service worker and request permission.
 * Returns true if push notifications are now enabled, false otherwise.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    log.warn('Push notifications are not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      log.info('Push notification permission denied');
      return false;
    }

    await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    log.info('Service worker registered for push notifications');
    return true;
  } catch (err) {
    log.error('Failed to register service worker:', err);
    return false;
  }
}

/**
 * Get the current push permission state without prompting.
 * Returns 'granted' | 'denied' | 'default'.
 */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// ────────────────────────── Due card check ──────────────────────────

/**
 * Check if the user has due review cards and trigger notifications
 * through the enabled channels.
 *
 * Intended to be called periodically (e.g. on app load or via a cron job).
 */
export async function checkAndNotifyDueCards(userId: string): Promise<void> {
  if (!userId) {
    log.warn('checkAndNotifyDueCards called without userId');
    return;
  }

  // Verify auth state
  const supabaseAuth = createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user || user.id !== userId) {
    log.warn('Auth mismatch in notification check');
    return;
  }

  const prefs = loadPreferences();

  // Count due cards from Supabase
  let dueCount = 0;
  try {
    const supabase = createClient();
    const { count, error } = await supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('due_date', new Date().toISOString());

    if (!error && count !== null) {
      dueCount = count;
    }
  } catch {
    log.warn('Failed to check due cards from Supabase');
    return;
  }

  if (dueCount === 0) return;

  // ── Push notification ──
  if (prefs.push && getPushPermissionState() === 'granted') {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Qalem', {
        body: `${dueCount} cartes à réviser`,
        icon: '/favicon.ico',
        tag: 'review-reminder',
      });
    } catch (err) {
      log.error('Failed to show push notification:', err);
    }
  }

  // ── Email notification (placeholder) ──
  if (prefs.email) {
    // TODO: Implement email notification via backend API route
    // e.g. POST /api/notifications/email { userId, dueCount }
    log.info(`Email notification placeholder: ${dueCount} cards due for user ${userId}`);
  }

  // ── WhatsApp via Evolution API (placeholder) ──
  if (prefs.whatsapp && prefs.whatsappNumber) {
    // TODO: Implement WhatsApp notification via Evolution API
    // The config structure is defined in EvolutionAPIConfig.
    // Example call:
    //   POST ${config.baseUrl}/message/sendText/${config.instanceName}
    //   Headers: { apikey: config.apiKey }
    //   Body: { number: prefs.whatsappNumber, text: `Qalem: ${dueCount} cartes à réviser` }
    log.info(
      `WhatsApp notification placeholder: ${dueCount} cards due → ${prefs.whatsappNumber}`,
    );
  }
}

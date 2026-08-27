'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { checkAndNotifyDueCards, REVIEW_REMINDER_INTERVAL_MS } from '@/lib/notifications';

/**
 * Registers the PWA service worker on mount.
 * Renders nothing — purely a side-effect component.
 */
export function ServiceWorkerRegistrar(): null {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;

    let active = true;
    const checkDueCards = () => {
      if (!active || document.visibilityState !== 'visible' || !navigator.onLine) return;
      void checkAndNotifyDueCards(user.id);
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkDueCards();
    };

    checkDueCards();
    const interval = window.setInterval(checkDueCards, REVIEW_REMINDER_INTERVAL_MS);
    window.addEventListener('online', checkDueCards);
    document.addEventListener('visibilitychange', checkWhenVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', checkDueCards);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [isLoading, user]);

  return null;
}

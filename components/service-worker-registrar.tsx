'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker on mount.
 * Renders nothing — purely a side-effect component.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[SW] Registration failed:', err);
    });
  }, []);

  return null;
}

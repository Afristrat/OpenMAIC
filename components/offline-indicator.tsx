'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { processQueue, getQueueSize } from '@/lib/offline/sync-queue';
import { WifiOff, RefreshCw, Check } from 'lucide-react';

type OfflineStatus = 'online' | 'offline' | 'syncing' | 'synced';

/**
 * Offline indicator banner.
 * Shows connection status and sync state. Auto-hides when online.
 */
export function OfflineIndicator(): React.ReactNode {
  const { t } = useI18n();
  const [status, setStatus] = useState<OfflineStatus>('online');
  const [queueSize, setQueueSize] = useState(0);

  const handleOnline = useCallback(async () => {
    setStatus('syncing');

    try {
      const size = await getQueueSize();
      if (size > 0) {
        await processQueue();
      }
      setStatus('synced');
      setQueueSize(0);

      // Auto-hide after 2 seconds
      setTimeout(() => setStatus('online'), 2000);
    } catch {
      setStatus('online');
    }
  }, []);

  const handleOffline = useCallback(async () => {
    setStatus('offline');
    try {
      const size = await getQueueSize();
      setQueueSize(size);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- Online/offline detection requires effect-based setState */
  useEffect(() => {
    // Set initial state
    if (!navigator.onLine) {
      void handleOffline();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [handleOnline, handleOffline]);

  // Don't render anything when online
  if (status === 'online') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        status === 'offline'
          ? 'bg-amber-500 text-white'
          : status === 'syncing'
            ? 'bg-blue-500 text-white'
            : 'bg-green-500 text-white'
      }`}
    >
      {status === 'offline' && (
        <>
          <WifiOff className="h-4 w-4" />
          <span>{t('offline.banner')}</span>
          {queueSize > 0 && (
            <span className="opacity-80">
              ({t('offline.queuedItems').replace('{n}', String(queueSize))})
            </span>
          )}
        </>
      )}
      {status === 'syncing' && (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{t('offline.syncing')}</span>
        </>
      )}
      {status === 'synced' && (
        <>
          <Check className="h-4 w-4" />
          <span>{t('offline.synced')}</span>
        </>
      )}
    </div>
  );
}

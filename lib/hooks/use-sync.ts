'use client';

/**
 * useSync — React hook for hybrid IndexedDB ↔ Supabase synchronization
 *
 * Behavior:
 * - On mount, checks auth state via Supabase
 * - If authenticated, runs an initial full sync
 * - Exposes `syncNow()` for manual trigger
 * - Provides `isSyncing` / `lastSyncAt` for UI feedback
 *
 * When the user is not authenticated everything is a no-op and the app
 * continues in pure IndexedDB mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSyncProvider } from '@/lib/storage/supabase-provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('useSync');

interface UseSyncReturn {
  /** Whether a sync operation is currently running */
  isSyncing: boolean;
  /** Timestamp of the last successful sync (ms epoch), or null */
  lastSyncAt: number | null;
  /** Whether the user is authenticated (sync-capable) */
  isAuthenticated: boolean;
  /** Manually trigger a full sync */
  syncNow: () => Promise<void>;
}

export function useSync(): UseSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Guard against running sync while one is already in progress
  const syncLock = useRef(false);

  const runSync = useCallback(async (): Promise<void> => {
    if (syncLock.current) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      const provider = getSyncProvider();
      const result = await provider.syncAll();
      setLastSyncAt(Date.now());
      log.info(`Sync complete: ${result.synced} synced, ${result.conflicts} conflicts`);
    } catch (err) {
      log.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, []);

  // On mount: check auth and run initial sync if authenticated
  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const provider = getSyncProvider();
      await provider.refreshAuth();

      if (cancelled) return;

      const authed = provider.isAuthenticated();
      setIsAuthenticated(authed);

      if (authed) {
        log.info('User authenticated — running initial sync');
        await runSync();
      } else {
        log.info('User not authenticated — IndexedDB-only mode');
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [runSync]);

  const syncNow = useCallback(async (): Promise<void> => {
    const provider = getSyncProvider();
    if (!provider.isAuthenticated()) return;
    await runSync();
  }, [runSync]);

  return { isSyncing, lastSyncAt, isAuthenticated, syncNow };
}

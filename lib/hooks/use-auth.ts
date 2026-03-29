'use client';

import { useState, useEffect, useCallback } from 'react';
import { tryCreateClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const GUEST_MODE_KEY = 'qalem-guest-mode';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  signOut: () => Promise<void>;
  setGuestMode: (enabled: boolean) => void;
}

export type { AuthState };

/**
 * Hook that wraps Supabase auth state.
 * Provides user, loading state, guest mode, and sign-out.
 * Listens to onAuthStateChange for real-time updates.
 * Stores guest mode preference in localStorage.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage + auth listener must happen in effect */
  useEffect(() => {
    const supabase = tryCreateClient();

    // Check guest mode from localStorage
    try {
      const guestStored = localStorage.getItem(GUEST_MODE_KEY);
      if (guestStored === 'true') {
        setIsGuest(true);
      }
    } catch {
      // localStorage unavailable
    }

    // No Supabase configured — run in guest/local-only mode
    if (!supabase) {
      setIsGuest(true);
      setIsLoading(false);
      return;
    }

    // Get initial user (server-side verified)
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Clear guest mode when user authenticates
        try {
          localStorage.removeItem(GUEST_MODE_KEY);
        } catch {
          // localStorage unavailable
        }
        setIsGuest(false);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const signOut = useCallback(async () => {
    const supabase = tryCreateClient();
    await supabase?.auth.signOut();
    setUser(null);
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {
      // localStorage unavailable
    }
    setIsGuest(false);
  }, []);

  const setGuestMode = useCallback((enabled: boolean) => {
    setIsGuest(enabled);
    try {
      if (enabled) {
        localStorage.setItem(GUEST_MODE_KEY, 'true');
      } else {
        localStorage.removeItem(GUEST_MODE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { user, isLoading, isGuest, signOut, setGuestMode };
}

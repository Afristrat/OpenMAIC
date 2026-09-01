'use client';

import { useState, useEffect, useCallback } from 'react';
import { tryCreateClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
const E2E_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e-admin@qalem.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
} as User;

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  signOut: () => Promise<void>;
}

export type { AuthState };

/**
 * Hook that wraps Supabase auth state.
 * Provides the authenticated user, loading state, and sign-out.
 * Listens to onAuthStateChange for real-time updates.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(E2E_TEST_MODE ? E2E_USER : null);
  const [isLoading, setIsLoading] = useState(!E2E_TEST_MODE);
  const isGuest = false;

  /* eslint-disable react-hooks/set-state-in-effect -- Auth hydration and listener registration must happen in an effect. */
  useEffect(() => {
    if (E2E_TEST_MODE) return;
    const supabase = tryCreateClient();

    // A missing auth backend must never become anonymous application access.
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Get initial user with timeout — don't block the app if Supabase is slow
    const timeout = setTimeout(() => {
      setIsLoading(false); // Unblock UI after 5s even if Supabase hasn't responded
    }, 5000);

    supabase.auth
      .getUser()
      .then(({ data: { user: currentUser } }) => {
        clearTimeout(timeout);
        setUser(currentUser);
        setIsLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setIsLoading(false);
      });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
  }, []);

  return { user, isLoading, isGuest, signOut };
}

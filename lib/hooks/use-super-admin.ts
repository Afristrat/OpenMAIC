'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';

/**
 * Check if the current user is a super admin.
 * Super admins can:
 * - Configure API keys (BYOK) in settings
 * - All keys they set via .env are available to all users
 *
 * Regular users:
 * - Use the platform with server-configured providers
 * - Cannot see or modify API keys
 * - See only the "general" settings (theme, language, audio voice selection)
 *
 * The super admin email list is kept server-side (SUPER_ADMIN_EMAILS env var,
 * without NEXT_PUBLIC_ prefix) to avoid leaking it to the client bundle.
 */
export function useIsSuperAdmin(): { isSuperAdmin: boolean; isLoading: boolean } {
  const { user, isLoading: authLoading, isGuest } = useAuth();
  const [state, setState] = useState<{ isAdmin: boolean; checked: boolean }>({
    isAdmin: false,
    checked: false,
  });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    // Only fetch when we have a valid, non-guest user
    if (authLoading || isGuest || !user) return;

    const check = async () => {
      try {
        const res = await fetch('/api/account/is-admin');
        const data: { isAdmin: boolean } = await res.json();
        if (!cancelledRef.current) {
          setState({ isAdmin: data.isAdmin, checked: true });
        }
      } catch {
        if (!cancelledRef.current) {
          setState({ isAdmin: false, checked: true });
        }
      }
    };

    check();

    return () => {
      cancelledRef.current = true;
    };
  }, [user, authLoading, isGuest]);

  // When there's no user / guest, always false
  const effectiveAdmin = (!authLoading && (isGuest || !user)) ? false : state.isAdmin;
  const isLoading = authLoading || (!state.checked && !isGuest && !!user);

  return {
    isSuperAdmin: effectiveAdmin,
    isLoading,
  };
}

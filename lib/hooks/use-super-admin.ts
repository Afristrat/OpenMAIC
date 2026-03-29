'use client';

import { useAuth } from './use-auth';

/**
 * SUPER_ADMIN_EMAILS is set server-side via env var.
 * We expose it to the client via a Next.js public env var.
 * Format: comma-separated emails.
 * Example: NEXT_PUBLIC_SUPER_ADMIN_EMAILS=admin@qalem.ma,amine@qalem.ma
 *
 * If not set, the first authenticated user is considered super admin (dev mode).
 */
const SUPER_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
 */
export function useIsSuperAdmin(): { isSuperAdmin: boolean; isLoading: boolean } {
  const { user, isLoading, isGuest } = useAuth();

  if (isLoading) return { isSuperAdmin: false, isLoading: true };

  // Guests are never super admin
  if (isGuest || !user) return { isSuperAdmin: false, isLoading: false };

  // If no super admin emails configured, first user is admin (dev mode)
  if (SUPER_ADMIN_EMAILS.length === 0) {
    return { isSuperAdmin: true, isLoading: false };
  }

  const userEmail = user.email?.toLowerCase() || '';
  return {
    isSuperAdmin: SUPER_ADMIN_EMAILS.includes(userEmail),
    isLoading: false,
  };
}

import { createBrowserClient } from '@supabase/ssr';
import { createClient as createJsClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase browser client.
 * Throws if env vars are missing — use `tryCreateClient()` when Supabase is optional.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createBrowserClient(url, key, { cookieOptions: { name: 'sb-db-auth-token' } });
}

/**
 * Returns a Supabase browser client, or null if env vars are not configured.
 * Use this in contexts where Supabase is optional (auth, sync, notifications).
 */
export function tryCreateClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key, { cookieOptions: { name: 'sb-db-auth-token' } });
}

/**
 * Browser client for requesting a password-recovery email. It uses the implicit
 * flow on purpose: the PKCE flow only works when the link is opened in the very
 * browser that asked for it, which fails for mail-app in-app browsers and for
 * another device. The implicit link carries its own tokens and works anywhere.
 */
export function tryCreateRecoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createJsClient(url, key, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
  });
}

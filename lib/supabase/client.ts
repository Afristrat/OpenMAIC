import { createBrowserClient } from '@supabase/ssr'

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
  return createBrowserClient(url, key);
}

/**
 * Returns a Supabase browser client, or null if env vars are not configured.
 * Use this in contexts where Supabase is optional (auth, sync, notifications).
 */
export function tryCreateClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

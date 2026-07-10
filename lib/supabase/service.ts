/**
 * Supabase service-role client for server-side operations that bypass RLS.
 *
 * IMPORTANT: This client uses the service role key and must NEVER be exposed
 * to the client or frontend bundles. Use only in server-side code (API routes,
 * background jobs, webhook dispatchers).
 */

import { createClient } from '@supabase/supabase-js';

export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

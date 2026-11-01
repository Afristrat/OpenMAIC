import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    // Browser sessions are issued against db.qalem.ma; keep their storage key
    // stable when server-side traffic uses the private Kong endpoint.
    cookieOptions: { name: 'sb-db-auth-token' },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // Next refuses cookie writes while a Server Component renders. A session refresh triggered there
        // raised outside any try/catch and left the render pending until Cloudflare cut it with a 524.
        // The refreshed cookie is written by route handlers and the proxy; here the write is skipped.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: nothing to persist, the caller handles the missing session.
        }
      },
    },
  });
}

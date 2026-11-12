const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * NEXT_PUBLIC_E2E_TEST_MODE skips the session check of the private area, so a
 * build may carry it only when Supabase points at the local test double.
 * Called from next.config.ts: a build that would ship the bypass against a
 * real Supabase fails instead of deploying.
 */
export function assertE2eModeIsLocal(env: Record<string, string | undefined>): void {
  if (env.NEXT_PUBLIC_E2E_TEST_MODE !== 'true') return;
  let host = '';
  try {
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    // An absent or unreadable URL is not a local test double.
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      'NEXT_PUBLIC_E2E_TEST_MODE=true is only allowed against a local Supabase (127.0.0.1 or localhost).',
    );
  }
}

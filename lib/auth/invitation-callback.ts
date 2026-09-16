/**
 * GoTrue establishes a temporary session after either an invitation or a
 * recovery link. In both cases Qalem must present the password-definition
 * form, never the ordinary sign-in form.
 */
export function isSupabasePasswordSetupCallback(search: string, hash: string): boolean {
  return getSupabasePasswordSetupCallback(search, hash) !== null;
}

export type SupabasePasswordSetupCallback = {
  type: 'invite' | 'recovery';
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
};

/**
 * Reads the callback values without creating a session. The auth screen must
 * persist an implicit-flow session before it asks Supabase who the recipient
 * is; otherwise a valid recovery link is incorrectly shown as expired.
 */
export function getSupabasePasswordSetupCallback(
  search: string,
  hash: string,
): SupabasePasswordSetupCallback | null {
  const parameters = new URLSearchParams(`${search.replace(/^\?/, '')}&${hash.replace(/^#/, '')}`);
  const type = parameters.get('type');
  if (type !== 'invite' && type !== 'recovery') return null;
  return {
    type,
    accessToken: parameters.get('access_token'),
    refreshToken: parameters.get('refresh_token'),
    code: parameters.get('code'),
  };
}

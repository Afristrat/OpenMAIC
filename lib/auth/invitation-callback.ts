/**
 * GoTrue establishes a temporary session after either an invitation or a
 * recovery link. In both cases Qalem must present the password-definition
 * form, never the ordinary sign-in form.
 */
export function isSupabasePasswordSetupCallback(search: string, hash: string): boolean {
  const parameters = new URLSearchParams(`${search.replace(/^\?/, '')}&${hash.replace(/^#/, '')}`);
  const type = parameters.get('type');
  return type === 'invite' || type === 'recovery';
}

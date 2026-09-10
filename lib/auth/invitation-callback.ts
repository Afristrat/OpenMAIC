export function isSupabaseInvitationCallback(search: string, hash: string): boolean {
  const parameters = new URLSearchParams(`${search.replace(/^\?/, '')}&${hash.replace(/^#/, '')}`);
  return parameters.get('type') === 'invite';
}

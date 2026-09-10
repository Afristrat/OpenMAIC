import { describe, expect, it } from 'vitest';
import { isSupabaseInvitationCallback } from '@/lib/auth/invitation-callback';

describe('isSupabaseInvitationCallback', () => {
  it('recognizes the invitation type returned by GoTrue in either URL component', () => {
    expect(isSupabaseInvitationCallback('', '#access_token=session&type=invite')).toBe(true);
    expect(isSupabaseInvitationCallback('?type=invite', '')).toBe(true);
  });

  it('does not mistake another authentication callback for an invitation', () => {
    expect(isSupabaseInvitationCallback('', '#access_token=session&type=recovery')).toBe(false);
  });
});

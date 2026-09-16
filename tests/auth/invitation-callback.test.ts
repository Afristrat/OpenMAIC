import { describe, expect, it } from 'vitest';
import { isSupabasePasswordSetupCallback } from '@/lib/auth/invitation-callback';

describe('isSupabasePasswordSetupCallback', () => {
  it('recognizes an invitation callback in either URL component', () => {
    expect(isSupabasePasswordSetupCallback('', '#access_token=session&type=invite')).toBe(true);
    expect(isSupabasePasswordSetupCallback('?type=invite', '')).toBe(true);
  });

  it('recognizes a recovery callback so an invited user without a password can set one', () => {
    expect(isSupabasePasswordSetupCallback('', '#access_token=session&type=recovery')).toBe(true);
  });

  it('does not mistake another authentication callback for password setup', () => {
    expect(isSupabasePasswordSetupCallback('', '#access_token=session&type=magiclink')).toBe(false);
  });
});

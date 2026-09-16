import { describe, expect, it } from 'vitest';
import {
  getSupabasePasswordSetupCallback,
  isSupabasePasswordSetupCallback,
} from '@/lib/auth/invitation-callback';

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

  it('extracts an implicit recovery session before the recipient check', () => {
    expect(
      getSupabasePasswordSetupCallback(
        '',
        '#access_token=access-value&refresh_token=refresh-value&type=recovery',
      ),
    ).toEqual({
      type: 'recovery',
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
      code: null,
    });
  });

  it('extracts a PKCE code callback without confusing it with an implicit token', () => {
    expect(getSupabasePasswordSetupCallback('?code=pkce-code&type=invite', '')).toEqual({
      type: 'invite',
      accessToken: null,
      refreshToken: null,
      code: 'pkce-code',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { extractAuthenticatedUserIdFromCookies } from '@/proxy';

const USER_ID = 'a2793097-5b1a-4ce7-bb4a-0a6a7e554d73';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createAccessToken(subject = USER_ID): string {
  return `${encodeBase64Url(JSON.stringify({ alg: 'none' }))}.${encodeBase64Url(
    JSON.stringify({ sub: subject }),
  )}.signature`;
}

function cookie(name: string, value: string): [string, { value: string }] {
  return [name, { value }];
}

describe('extractAuthenticatedUserIdFromCookies', () => {
  it('reads the current Supabase SSR base64 session object', () => {
    const session = JSON.stringify({ access_token: createAccessToken(), refresh_token: 'unused' });
    const storedSession = `base64-${encodeBase64Url(session)}`;

    expect(
      extractAuthenticatedUserIdFromCookies([cookie('sb-supabase-auth-token', storedSession)]),
    ).toBe(USER_ID);
  });

  it('reassembles current Supabase SSR cookie chunks in numerical order', () => {
    const session = JSON.stringify({ access_token: createAccessToken() });
    const storedSession = `base64-${encodeBase64Url(session)}`;
    const splitAt = Math.floor(storedSession.length / 2);

    expect(
      extractAuthenticatedUserIdFromCookies([
        cookie('sb-supabase-auth-token.1', storedSession.slice(splitAt)),
        cookie('sb-supabase-auth-token.0', storedSession.slice(0, splitAt)),
      ]),
    ).toBe(USER_ID);
  });

  it('keeps compatibility with the legacy raw token array', () => {
    expect(
      extractAuthenticatedUserIdFromCookies([
        cookie('sb-supabase-auth-token', JSON.stringify([createAccessToken(), 'unused'])),
      ]),
    ).toBe(USER_ID);
  });

  it('fails closed for malformed sessions and incomplete chunks', () => {
    expect(
      extractAuthenticatedUserIdFromCookies([
        cookie('sb-supabase-auth-token.1', 'orphaned-cookie-chunk'),
      ]),
    ).toBeUndefined();
    expect(
      extractAuthenticatedUserIdFromCookies([
        cookie('sb-supabase-auth-token', 'base64-not-valid-base64'),
      ]),
    ).toBeUndefined();
  });
});

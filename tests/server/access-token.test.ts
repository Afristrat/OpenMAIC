import { describe, expect, test, vi } from 'vitest';

import { createAccessToken, verifyAccessToken } from '@/lib/server/access-token';

describe('access token signing', () => {
  test('verifies tokens signed with the same access code', () => {
    vi.setSystemTime(new Date('2026-06-25T00:00:00Z'));

    const token = createAccessToken('demo-code');

    expect(verifyAccessToken(token, 'demo-code')).toBe(true);
    expect(verifyAccessToken(token, 'other-code')).toBe(false);
    expect(verifyAccessToken('bad-token', 'demo-code')).toBe(false);

    vi.useRealTimers();
  });

  test('rejects a token older than the 7-day cookie lifetime, accepts one just inside it', () => {
    vi.setSystemTime(new Date('2026-06-25T00:00:00Z'));
    const token = createAccessToken('demo-code');

    vi.setSystemTime(new Date('2026-07-01T23:59:00Z'));
    expect(verifyAccessToken(token, 'demo-code')).toBe(true);

    vi.setSystemTime(new Date('2026-07-02T00:00:01Z'));
    expect(verifyAccessToken(token, 'demo-code')).toBe(false);

    vi.useRealTimers();
  });

  test('rejects a token timestamped in the future and a non numeric timestamp', () => {
    vi.setSystemTime(new Date('2026-06-25T00:00:00Z'));
    const future = createAccessToken('demo-code');
    vi.setSystemTime(new Date('2026-06-24T00:00:00Z'));
    expect(verifyAccessToken(future, 'demo-code')).toBe(false);
    expect(verifyAccessToken('abc.def', 'demo-code')).toBe(false);
    vi.useRealTimers();
  });
});

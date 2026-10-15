import { createHmac } from 'crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';

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

  test('la signature n’est pas un HMAC direct du code : pas de calcul hors ligne trivial depuis un cookie', () => {
    vi.setSystemTime(new Date('2026-06-25T00:00:00Z'));
    const token = createAccessToken('demo-code');
    const [timestamp, signature] = token.split('.');

    const legacy = createHmac('sha256', 'demo-code').update(timestamp).digest('hex');
    expect(signature).not.toBe(legacy);
    // Un ancien jeton (signé avec le code brut) est refusé : les sessions existantes se réinitialisent.
    expect(verifyAccessToken(`${timestamp}.${legacy}`, 'demo-code')).toBe(false);
    // La clé n'est pas non plus un simple HMAC étiqueté du code.
    const labelled = createHmac(
      'sha256',
      createHmac('sha256', 'demo-code').update('access-token').digest(),
    )
      .update(timestamp)
      .digest('hex');
    expect(signature).not.toBe(labelled);
    vi.useRealTimers();
  });

  describe('avec ACCESS_TOKEN_SECRET', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    test('un jeton n’est valide que sous le même secret serveur', () => {
      vi.setSystemTime(new Date('2026-06-25T00:00:00Z'));
      vi.stubEnv('ACCESS_TOKEN_SECRET', 'secret-serveur-a');
      const token = createAccessToken('demo-code');
      expect(verifyAccessToken(token, 'demo-code')).toBe(true);

      vi.stubEnv('ACCESS_TOKEN_SECRET', 'secret-serveur-b');
      expect(verifyAccessToken(token, 'demo-code')).toBe(false);

      vi.stubEnv('ACCESS_TOKEN_SECRET', '');
      expect(verifyAccessToken(token, 'demo-code')).toBe(false);
    });
  });
});

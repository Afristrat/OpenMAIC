import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rate limit store: élagage borné', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('n’élague pas les entrées expirées plus d’une fois par seconde, mais reste borné', async () => {
    const { checkRateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_KEYS } =
      await import('@/lib/rate-limit');

    for (let index = 0; index < RATE_LIMIT_MAX_KEYS; index += 1) {
      await checkRateLimit(`ip:a-${index}`, 'anonymous');
    }
    expect(getRateLimitStoreSize()).toBe(RATE_LIMIT_MAX_KEYS);

    // Magasin plein : premier dépassement, élagage autorisé (rien d'expiré), éviction du plus ancien.
    vi.setSystemTime(1_000_000 + 59_500);
    await checkRateLimit('ip:p', 'anonymous');
    expect(getRateLimitStoreSize()).toBe(RATE_LIMIT_MAX_KEYS);

    // 900 ms plus tard : les clés « a » sont expirées, mais l'élagage est limité à 1 par seconde.
    vi.setSystemTime(1_000_000 + 60_400);
    await checkRateLimit('ip:q', 'anonymous');
    expect(getRateLimitStoreSize()).toBe(RATE_LIMIT_MAX_KEYS);

    // Plus d'une seconde après : l'élagage reprend et libère les entrées expirées.
    vi.setSystemTime(1_000_000 + 61_000);
    await checkRateLimit('ip:r', 'anonymous');
    expect(getRateLimitStoreSize()).toBeLessThan(10);
  });

  it('évince les plus anciennes clés plutôt que de dépasser le plafond', async () => {
    const { checkRateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_KEYS } =
      await import('@/lib/rate-limit');

    for (let index = 0; index < RATE_LIMIT_MAX_KEYS + 1_000; index += 1) {
      await checkRateLimit(`ip:flood-${index}`, 'anonymous');
    }
    expect(getRateLimitStoreSize()).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
  });
});

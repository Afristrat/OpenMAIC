import { describe, expect, it } from 'vitest';
import { checkRateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_KEYS } from '@/lib/rate-limit';

describe('rate limit store', () => {
  it('stays bounded when an attacker mints unlimited distinct keys', async () => {
    for (let index = 0; index < RATE_LIMIT_MAX_KEYS + 500; index += 1) {
      await checkRateLimit(`ip:flood-${index}`, 'anonymous');
    }

    expect(getRateLimitStoreSize()).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
  });

  it('keeps enforcing the limit for a key under load after evictions', async () => {
    let blocked = false;
    for (let index = 0; index < 150; index += 1) {
      const result = await checkRateLimit('ip:steady-client', 'anonymous');
      if (!result.allowed) blocked = true;
    }

    expect(blocked).toBe(true);
  });
});

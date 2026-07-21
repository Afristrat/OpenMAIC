import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkQuota, getPlan, PLANS } from '@/lib/billing/plans';
import { checkRateLimit } from '@/lib/rate-limit';

describe('commercial plan catalogue', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('has no free or trial plan', () => {
    expect(Object.keys(PLANS)).toEqual(['unlicensed', 'pro', 'enterprise']);
    expect(Object.keys(PLANS)).not.toContain('free');
    expect(Object.keys(PLANS)).not.toContain('trial');
  });

  it('does not grant quotas or publish a price before licensing', () => {
    expect(PLANS.unlicensed).toMatchObject({
      ttsMinutesPerMonth: 0,
      classroomsMax: 0,
      membersMax: 0,
      price: { MAD: null, USD: null },
    });
  });

  it('falls back to unlicensed for an unknown database value', () => {
    expect(getPlan('unknown')).toBe(PLANS.unlicensed);
    expect(getPlan('free')).toBe(PLANS.unlicensed);
  });

  it('fails closed when quota storage is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    expect(await checkQuota('missing-org', 'unknown_metric')).toEqual({
      allowed: false,
      used: 0,
      limit: 0,
    });
  });

  it('keeps abuse protection independent from commercial licensing', async () => {
    await expect(checkRateLimit('anonymous-test', 'anonymous')).resolves.toEqual({
      allowed: true,
      remaining: 99,
    });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACCESS_CODE_THROTTLE_MAX_KEYS,
  accessCodeThrottleSize,
  accessCodeThrottleStatus,
  clearAccessCodeFailures,
  recordAccessCodeFailure,
  resetAccessCodeThrottle,
} from '@/lib/server/access-code-throttle';

const T0 = 1_800_000_000_000;

describe('access code throttle (5 échecs par minute puis blocage de 15 minutes)', () => {
  beforeEach(() => resetAccessCodeThrottle());

  it('ne bloque pas avant le cinquième échec', () => {
    for (let i = 0; i < 4; i++) recordAccessCodeFailure('ip:a', T0 + i);
    expect(accessCodeThrottleStatus('ip:a', T0 + 10).blocked).toBe(false);
  });

  it('bloque 15 minutes au cinquième échec dans la minute, puis libère', () => {
    for (let i = 0; i < 5; i++) recordAccessCodeFailure('ip:a', T0 + i * 1000);
    const blocked = accessCodeThrottleStatus('ip:a', T0 + 6000);
    expect(blocked.blocked).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(accessCodeThrottleStatus('ip:a', T0 + 4000 + 15 * 60_000 - 1).blocked).toBe(true);
    expect(accessCodeThrottleStatus('ip:a', T0 + 4000 + 15 * 60_000 + 1).blocked).toBe(false);
  });

  it('n’accumule pas des échecs espacés de plus d’une minute', () => {
    for (let i = 0; i < 20; i++) recordAccessCodeFailure('ip:a', T0 + i * 61_000);
    expect(accessCodeThrottleStatus('ip:a', T0 + 20 * 61_000).blocked).toBe(false);
  });

  it('isole les adresses et réinitialise après un succès', () => {
    for (let i = 0; i < 5; i++) recordAccessCodeFailure('ip:a', T0 + i);
    expect(accessCodeThrottleStatus('ip:b', T0 + 10).blocked).toBe(false);
    for (let i = 0; i < 4; i++) recordAccessCodeFailure('ip:c', T0 + i);
    clearAccessCodeFailures('ip:c');
    recordAccessCodeFailure('ip:c', T0 + 10);
    expect(accessCodeThrottleStatus('ip:c', T0 + 11).blocked).toBe(false);
  });

  it('reste borné quand des adresses distinctes sont forgées en masse', () => {
    for (let i = 0; i < ACCESS_CODE_THROTTLE_MAX_KEYS + 500; i++) {
      recordAccessCodeFailure(`ip:${i}`, T0);
    }
    expect(accessCodeThrottleSize()).toBeLessThanOrEqual(ACCESS_CODE_THROTTLE_MAX_KEYS);
  });
});

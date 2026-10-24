import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => log }));

import {
  recordReservationOverrun,
  resetReservationOverruns,
} from '@/lib/billing/reservation-overruns';

describe('dépassements de réservation par tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReservationOverruns();
  });

  it('compte par tenant et reste à l’avertissement sous le seuil', () => {
    expect(recordReservationOverrun('tenant-a', 'llm_input_token', 120, 100)).toBe(1);
    expect(recordReservationOverrun('tenant-a', 'llm_input_token', 130, 100)).toBe(2);
    expect(recordReservationOverrun('tenant-b', 'llm_input_token', 130, 100)).toBe(1);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(3);
  });

  it('passe en erreur d’alerte au seuil de dépassements répétés du même tenant', () => {
    vi.stubEnv('RESERVATION_OVERRUN_ALERT_THRESHOLD', '3');
    for (let index = 0; index < 3; index += 1) {
      recordReservationOverrun('tenant-a', 'llm_input_token', 120, 100);
    }
    expect(log.error).toHaveBeenCalledOnce();
    expect(String(log.error.mock.calls[0][0])).toContain('tenant-a');
    vi.unstubAllEnvs();
  });
});

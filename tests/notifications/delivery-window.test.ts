import { describe, expect, it } from 'vitest';
import { isWithinQuietWindow } from '@/lib/notifications/delivery-window';

describe('delivery quiet window', () => {
  const window = { timezone: 'Africa/Casablanca', quietStart: '22:00', quietEnd: '07:00' };

  it('honours a quiet window crossing midnight in the learner timezone', () => {
    expect(isWithinQuietWindow(new Date('2026-09-12T22:30:00+01:00'), window)).toBe(true);
    expect(isWithinQuietWindow(new Date('2026-09-13T06:30:00+01:00'), window)).toBe(true);
    expect(isWithinQuietWindow(new Date('2026-09-13T12:00:00+01:00'), window)).toBe(false);
  });

  it('rejects malformed clocks instead of guessing', () => {
    expect(() => isWithinQuietWindow(new Date(), { ...window, quietStart: '25:00' })).toThrow();
  });
});

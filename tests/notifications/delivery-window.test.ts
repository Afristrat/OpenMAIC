import { describe, expect, it } from 'vitest';
import { isWithinQuietWindow, shouldDeferDelivery } from '@/lib/notifications/delivery-window';

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

  it('defers an explicit pause independently of quiet hours', () => {
    expect(
      shouldDeferDelivery(new Date('2026-09-12T12:00:00Z'), {
        timezone: 'UTC',
        quietStart: null,
        quietEnd: null,
        pausedUntil: '2026-09-13T12:00:00Z',
      }),
    ).toBe(true);
  });

  it('uses the selected timezone and survives a daylight-saving transition', () => {
    const parisWindow = { timezone: 'Europe/Paris', quietStart: '01:00', quietEnd: '04:00' };
    expect(isWithinQuietWindow(new Date('2026-03-29T00:30:00Z'), parisWindow)).toBe(true);
    expect(isWithinQuietWindow(new Date('2026-03-29T01:30:00Z'), parisWindow)).toBe(true);
    expect(
      isWithinQuietWindow(new Date('2026-03-29T03:30:00Z'), {
        ...parisWindow,
        timezone: 'UTC',
      }),
    ).toBe(true);
    expect(isWithinQuietWindow(new Date('2026-03-29T03:30:00Z'), parisWindow)).toBe(false);
  });
});

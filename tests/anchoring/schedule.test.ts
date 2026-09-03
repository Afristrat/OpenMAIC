import { describe, expect, it } from 'vitest';
import { buildAnchorSchedule } from '@/lib/anchoring/schedule';

describe('anchor schedule', () => {
  it('grows spacing, schedules cold evaluations, and never exceeds J+90', () => {
    const optedInAt = new Date('2026-09-03T12:00:00.000Z');
    const deliveries = buildAnchorSchedule(
      optedInAt,
      Array.from({ length: 12 }, (_, index) => `seed-${index + 1}`),
    );
    const days = deliveries.map(
      (delivery) => (delivery.scheduledFor.getTime() - optedInAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(Math.max(...days)).toBeLessThanOrEqual(90);
    expect(deliveries.filter((delivery) => delivery.kind === 'cold_eval')).toEqual([
      expect.objectContaining({ phase: 'cold_30' }),
      expect.objectContaining({ phase: 'cold_60' }),
    ]);
    expect(deliveries.filter((delivery) => delivery.kind === 'seed')).toHaveLength(12);
    expect(new Set(deliveries.map((delivery) => delivery.dedupeKey)).size).toBe(deliveries.length);
  });
});

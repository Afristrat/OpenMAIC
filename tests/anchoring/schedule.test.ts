import { describe, expect, it } from 'vitest';
import { buildAnchorSchedule, selectAnchorSeedIds } from '@/lib/anchoring/schedule';

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

describe('anchor seed selection', () => {
  it('keeps a balanced twelve-seed journey from a richer stock without extending J+90', () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `anecdote-${index + 1}`,
        kind: 'anecdote' as const,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `highlight-${index + 1}`,
        kind: 'highlight' as const,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `joke-${index + 1}`,
        kind: 'joke' as const,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `quiz-${index + 1}`,
        kind: 'quiz_reminder' as const,
      })),
    ];

    const selected = selectAnchorSeedIds(candidates);

    expect(selected).toHaveLength(12);
    expect(selected).toEqual([
      'anecdote-1',
      'anecdote-2',
      'anecdote-3',
      'anecdote-4',
      'highlight-1',
      'highlight-2',
      'highlight-3',
      'highlight-4',
      'joke-1',
      'joke-2',
      'quiz-1',
      'quiz-2',
    ]);
    expect(() => buildAnchorSchedule(new Date('2026-09-03T12:00:00.000Z'), selected)).not.toThrow();
  });

  it('refuses a stock that cannot keep the promised seed mix', () => {
    expect(() =>
      selectAnchorSeedIds([
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `a-${index}`,
          kind: 'anecdote' as const,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `h-${index}`,
          kind: 'highlight' as const,
        })),
        ...Array.from({ length: 2 }, (_, index) => ({ id: `j-${index}`, kind: 'joke' as const })),
        { id: 'q-1', kind: 'quiz_reminder' as const },
      ]),
    ).toThrow('Incomplete quiz_reminder seed stock');
  });

  it('does not accept an unselected thirteenth seed in the 90-day calendar', () => {
    expect(() =>
      buildAnchorSchedule(
        new Date('2026-09-03T12:00:00.000Z'),
        Array.from({ length: 13 }, (_, index) => `seed-${index + 1}`),
      ),
    ).toThrow('Exactly twelve unique planned seeds are required');
  });
});

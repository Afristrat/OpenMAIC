const DAY_MS = 24 * 60 * 60 * 1000;

export type AnchorScheduleItem =
  | {
      kind: 'seed';
      seedId: string;
      scheduledFor: Date;
      dedupeKey: string;
    }
  | {
      kind: 'cold_eval';
      phase: 'cold_30' | 'cold_60';
      scheduledFor: Date;
      dedupeKey: string;
    };

export function buildAnchorSchedule(optedInAt: Date, seedIds: string[]): AnchorScheduleItem[] {
  if (Number.isNaN(optedInAt.getTime())) throw new Error('Invalid opt-in date');
  if (seedIds.length < 12 || new Set(seedIds).size !== seedIds.length) {
    throw new Error('A complete unique seed stock is required');
  }

  let elapsedDays = 0;
  const seeds = seedIds.map((seedId, index): AnchorScheduleItem => {
    elapsedDays += index + 2;
    if (elapsedDays > 90) throw new Error('Seed stock exceeds the J+90 schedule capacity');
    return {
      kind: 'seed',
      seedId,
      scheduledFor: new Date(optedInAt.getTime() + elapsedDays * DAY_MS),
      dedupeKey: `seed:${seedId}`,
    };
  });

  return [
    ...seeds,
    {
      kind: 'cold_eval' as const,
      phase: 'cold_30' as const,
      scheduledFor: new Date(optedInAt.getTime() + 30 * DAY_MS),
      dedupeKey: 'cold_eval:cold_30',
    },
    {
      kind: 'cold_eval' as const,
      phase: 'cold_60' as const,
      scheduledFor: new Date(optedInAt.getTime() + 60 * DAY_MS),
      dedupeKey: 'cold_eval:cold_60',
    },
  ].sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());
}

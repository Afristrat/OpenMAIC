const DAY_MS = 24 * 60 * 60 * 1000;
const PLANNED_SEED_COUNT = 12;

export type AnchorSeedKind = 'anecdote' | 'highlight' | 'joke' | 'quiz_reminder';

export interface AnchorSeedCandidate {
  id: string;
  kind: AnchorSeedKind;
}

const SCHEDULED_SEED_QUOTAS: Readonly<Record<AnchorSeedKind, number>> = {
  anecdote: 4,
  highlight: 4,
  joke: 2,
  quiz_reminder: 2,
};

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

/**
 * A seed stock can be richer than the initial 90-day journey. Select the
 * stable, balanced subset here instead of silently extending the consent window.
 */
export function selectAnchorSeedIds(candidates: AnchorSeedCandidate[]): string[] {
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new Error('Seed stock contains duplicate identifiers');
  }

  const selected: string[] = [];
  for (const kind of Object.keys(SCHEDULED_SEED_QUOTAS) as AnchorSeedKind[]) {
    const quota = SCHEDULED_SEED_QUOTAS[kind];
    const matching = candidates.filter((candidate) => candidate.kind === kind).slice(0, quota);
    if (matching.length !== quota) throw new Error(`Incomplete ${kind} seed stock`);
    selected.push(...matching.map((candidate) => candidate.id));
  }
  return selected;
}

export function buildAnchorSchedule(optedInAt: Date, seedIds: string[]): AnchorScheduleItem[] {
  if (Number.isNaN(optedInAt.getTime())) throw new Error('Invalid opt-in date');
  if (seedIds.length !== PLANNED_SEED_COUNT || new Set(seedIds).size !== seedIds.length) {
    throw new Error('Exactly twelve unique planned seeds are required');
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

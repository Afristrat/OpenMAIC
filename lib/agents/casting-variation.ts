import { createHash } from 'node:crypto';

type CastAgent = {
  id: string;
  name: string;
  role: string;
  mechanismId?: string;
  gender?: string;
  voiceConfig?: { providerId?: string; voiceId?: string };
};

export interface CastingReservation {
  id: string;
}

export class CastingVariationExhaustedError extends Error {
  constructor() {
    super('No distinct casting remains for this learner and course.');
    this.name = 'CastingVariationExhaustedError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Until S1-003 persists courses, a normalized generation request is the
 * course identity. This UUID is deterministic, non-reversible, and is
 * replaced by input.courseId as soon as a persisted course is available.
 */
export function deriveCourseId(orgId: string, requirement: string): string {
  const digest = sha256(`${orgId}:${requirement.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`);
  const bytes = digest.slice(0, 32).split('');
  bytes[12] = '5';
  bytes[16] = ((Number.parseInt(bytes[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Hash the actual pedagogical lineup, independently from display order. */
export function createLineupHash(agents: readonly CastAgent[]): string {
  const canonical = agents
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      mechanismId: agent.mechanismId ?? '',
      gender: agent.gender ?? '',
      providerId: agent.voiceConfig?.providerId ?? '',
      voiceId: agent.voiceConfig?.voiceId ?? '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return sha256(JSON.stringify(canonical));
}

/**
 * The database unique constraint is the authority. A duplicate insertion is
 * the only collision signal: draw again rather than maintaining a stale cache.
 */
export async function reserveDistinctCasting<T extends readonly CastAgent[]>({
  draw,
  reserve,
  maxAttempts = 32,
}: {
  draw: () => T;
  reserve: (agents: T, lineupHash: string) => Promise<CastingReservation | null>;
  maxAttempts?: number;
}): Promise<{ agents: T; reservation: CastingReservation; lineupHash: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const agents = draw();
    const lineupHash = createLineupHash(agents);
    const reservation = await reserve(agents, lineupHash);
    if (reservation) return { agents, reservation, lineupHash };
  }
  throw new CastingVariationExhaustedError();
}

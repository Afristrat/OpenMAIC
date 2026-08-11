import { describe, expect, it } from 'vitest';
import {
  createLineupHash,
  deriveCourseId,
  reserveDistinctCasting,
} from '@/lib/agents/casting-variation';

const firstCast = [
  { id: 'persona-professor', name: 'Younes', role: 'teacher', mechanismId: 'professor' },
  { id: 'persona-coach', name: 'Hanae', role: 'student', mechanismId: 'coach' },
] as const;

const secondCast = [
  { id: 'persona-professor', name: 'Younes', role: 'teacher', mechanismId: 'professor' },
  { id: 'persona-analyst', name: 'Khalid', role: 'student', mechanismId: 'analyst' },
] as const;

describe('casting variation', () => {
  it('derives one stable, non-reversible course UUID for the current generation flow', () => {
    const first = deriveCourseId('a4ec2f4b-9156-4aa8-9a6e-1491cfedcabc', '  Comprendre   LiteLLM ');
    expect(first).toBe(
      deriveCourseId('a4ec2f4b-9156-4aa8-9a6e-1491cfedcabc', 'comprendre litellm'),
    );
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('re-draws after a SQL uniqueness collision and reserves a different lineup', async () => {
    const draws = [firstCast, secondCast];
    const attemptedHashes: string[] = [];
    const result = await reserveDistinctCasting({
      draw: () => draws.shift() ?? secondCast,
      reserve: async (_agents, lineupHash) => {
        attemptedHashes.push(lineupHash);
        return lineupHash === createLineupHash(firstCast) ? null : { id: 'casting-2' };
      },
    });

    expect(attemptedHashes).toEqual([createLineupHash(firstCast), createLineupHash(secondCast)]);
    expect(result.agents).toEqual(secondCast);
    expect(result.lineupHash).not.toBe(createLineupHash(firstCast));
    expect(result.reused).toBe(false);
  });

  it('reuses a valid lineup when every distinct casting has already been reserved', async () => {
    const result = await reserveDistinctCasting({
      draw: () => firstCast,
      reserve: async () => null,
      maxAttempts: 2,
    });

    expect(result.agents).toEqual(firstCast);
    expect(result.reservation).toBeNull();
    expect(result.reused).toBe(true);
  });
});

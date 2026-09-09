import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('DataDrivenDirector');
// ponytail: latest 1,000 rows, not a minimum; use SQL aggregates if measured
// history volume requires a larger observation window.
const OBSERVATION_LIMIT = 1000;
const sequenceSchema = z.array(z.string().trim().min(1).max(256)).min(1).max(256);
const rowSchema = z
  .object({
    agent_sequence: sequenceSchema,
    intervention_types: sequenceSchema,
    post_discussion_quiz_score: z.number().min(0).max(1),
  })
  .refine((row) => row.agent_sequence.length === row.intervention_types.length);
const patternSchema = z
  .object({
    agentSequence: sequenceSchema,
    interventionTypes: sequenceSchema,
    avgQuizScore: z.number().min(0).max(1),
    sampleSize: z.number().int().positive().max(OBSERVATION_LIMIT),
  })
  .refine((p) => p.agentSequence.length === p.interventionTypes.length);

export type DiscussionPattern = z.infer<typeof patternSchema>;
export interface NextAgentSuggestion {
  agentId: string;
  sampleSize: number;
  observedMeanQuizScore: number;
  evidence: 'observational';
}

function comparePatterns(a: DiscussionPattern, b: DiscussionPattern): number {
  const score = b.avgQuizScore - a.avgQuizScore || b.sampleSize - a.sampleSize;
  const keyA = JSON.stringify([a.agentSequence, a.interventionTypes]);
  const keyB = JSON.stringify([b.agentSequence, b.interventionTypes]);
  return score || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0);
}

export function aggregateDiscussionPatterns(rows: unknown): DiscussionPattern[] {
  if (!Array.isArray(rows) || rows.length > OBSERVATION_LIMIT) return [];
  const groups = new Map<string, { pattern: DiscussionPattern; sum: number }>();
  for (const row of rows) {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) continue;
    const data = parsed.data;
    const key = JSON.stringify([data.agent_sequence, data.intervention_types]);
    const group = groups.get(key) ?? {
      pattern: {
        agentSequence: data.agent_sequence,
        interventionTypes: data.intervention_types,
        avgQuizScore: 0,
        sampleSize: 0,
      },
      sum: 0,
    };
    group.pattern.sampleSize += 1;
    group.sum += data.post_discussion_quiz_score;
    group.pattern.avgQuizScore = group.sum / group.pattern.sampleSize;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => group.pattern).sort(comparePatterns);
}

/** Server-side caller supplies the authorized, consented stages. No global query. */
export async function getBestPatterns(
  subject: string,
  language: string,
  authorizedStageIds: string[],
): Promise<DiscussionPattern[]> {
  const stages = z
    .array(z.string().trim().min(1).max(256))
    .min(1)
    .max(1000)
    .safeParse(authorizedStageIds);
  if (!stages.success || !subject.trim() || !language.trim()) return [];
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('discussion_patterns')
      .select('agent_sequence, intervention_types, post_discussion_quiz_score')
      .in('stage_id', [...new Set(stages.data)])
      .contains('subject_tags', [subject.trim()])
      .eq('language', language.trim())
      .not('post_discussion_quiz_score', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(OBSERVATION_LIMIT)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) {
      log.warn('Pattern query unavailable');
      return [];
    }
    return aggregateDiscussionPatterns(data);
  } catch {
    log.warn('Pattern query unavailable');
    return [];
  }
}

/** One valid observation suffices; scores describe observations, not causal gains. */
export function suggestNextAgent(
  currentSequence: string[],
  bestPatterns: DiscussionPattern[],
  availableAgents: string[],
): NextAgentSuggestion | null {
  if (bestPatterns.length > OBSERVATION_LIMIT) return null;
  const candidates: DiscussionPattern[] = [];
  for (const value of bestPatterns) {
    const parsed = patternSchema.safeParse(value);
    if (!parsed.success) continue;
    const p = parsed.data;
    if (
      p.agentSequence.length <= currentSequence.length ||
      !currentSequence.every((agent, index) => p.agentSequence[index] === agent) ||
      !availableAgents.includes(p.agentSequence[currentSequence.length])
    )
      continue;
    candidates.push(p);
  }
  const best = candidates.sort(comparePatterns)[0];
  if (!best) return null;
  return {
    agentId: best.agentSequence[currentSequence.length],
    sampleSize: best.sampleSize,
    observedMeanQuizScore: best.avgQuizScore,
    evidence: 'observational',
  };
}

/** Stable v1 cohort per server-generated session; expected 50/50, not an exact quota. */
export function shouldUseDataDriven(sessionId: string): boolean {
  if (!sessionId.trim() || sessionId.length > 256) return false;
  return (
    createHash('sha256').update(`qalem-director-v1:${sessionId}`).digest().readUInt32BE(0) % 2 === 0
  );
}

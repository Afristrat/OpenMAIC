import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('DataOptimizer');
const TARGET_SCORE = 0.7;
// ponytail: latest 1,000 observations, not a minimum; move aggregation to SQL
// when measured volume requires a larger historical window.
const OBSERVATION_LIMIT = 1000;
const sessionSchema = z.object({
  scene_sequence: z.array(z.string().trim().min(1).max(100)).min(1).max(256),
  quiz_scores: z.array(z.number().min(0).max(1)).min(1).max(512),
});

export interface OptimizationSuggestion {
  recommendedSceneOrder: string[];
  /** Bounded heuristic, not a measured improvement. */
  difficultyModifier: number;
  sampleSize: number;
  selectedSequenceSampleSize: number;
  observedMeanQuizScore: number;
  selectedSequenceMeanQuizScore: number;
  evidence: 'observational';
  observationWindowLimit: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Missing/invalid scores are not zero scores. One usable observation suffices. */
export function buildOptimizationSuggestion(rows: unknown): OptimizationSuggestion | null {
  if (!Array.isArray(rows) || rows.length > OBSERVATION_LIMIT) return null;
  const groups = new Map<string, { sequence: string[]; scoreSum: number; count: number }>();
  let scoreSum = 0;
  let scoreCount = 0;
  let sampleSize = 0;
  for (const row of rows) {
    const parsed = sessionSchema.safeParse(row);
    if (!parsed.success) continue;
    const { scene_sequence: sequence, quiz_scores: scores } = parsed.data;
    const sum = scores.reduce((total, score) => total + score, 0);
    const key = JSON.stringify(sequence);
    const group = groups.get(key) ?? { sequence, scoreSum: 0, count: 0 };
    group.scoreSum += sum / scores.length;
    group.count += 1;
    groups.set(key, group);
    scoreSum += sum;
    scoreCount += scores.length;
    sampleSize += 1;
  }
  if (!sampleSize) return null;
  // Deterministic ties: more observations, then the serialized sequence.
  const best = [...groups.entries()].sort(
    ([keyA, a], [keyB, b]) =>
      b.scoreSum / b.count - a.scoreSum / a.count ||
      b.count - a.count ||
      (keyA < keyB ? -1 : keyA > keyB ? 1 : 0),
  )[0][1];
  const observedMean = scoreSum / scoreCount;
  return {
    recommendedSceneOrder: best.sequence,
    difficultyModifier: round(Math.max(-0.2, Math.min(0.2, observedMean - TARGET_SCORE))),
    sampleSize,
    selectedSequenceSampleSize: best.count,
    observedMeanQuizScore: round(observedMean),
    selectedSequenceMeanQuizScore: round(best.scoreSum / best.count),
    evidence: 'observational',
    observationWindowLimit: OBSERVATION_LIMIT,
  };
}

/** Server-side candidate; callers must supply authorized stages, never all tenants. */
export async function getOptimizationSuggestion(
  subject: string,
  level: string,
  language: string,
  authorizedStageIds: string[],
): Promise<OptimizationSuggestion | null> {
  if (!subject.trim() || !level.trim() || !language.trim() || !authorizedStageIds.length)
    return null;
  const stages = z.array(z.string().trim().min(1).max(256)).max(1000).safeParse(authorizedStageIds);
  if (!stages.success) return null;
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('pedagogy_telemetry')
      .select('scene_sequence, quiz_scores')
      .in('stage_id', [...new Set(stages.data)])
      .contains('subject_tags', [subject.trim()])
      .eq('level', level.trim())
      .eq('language', language.trim())
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(OBSERVATION_LIMIT)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) {
      log.warn('Observation query unavailable');
      return null;
    }
    return buildOptimizationSuggestion(data);
  } catch {
    log.warn('Observation query unavailable');
    return null;
  }
}

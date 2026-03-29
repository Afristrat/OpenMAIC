// =============================================================================
// Qalem — Data-driven Generation Optimizer
// Queries aggregated pedagogy telemetry to suggest scene ordering and
// difficulty adjustments for the generation pipeline.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptimizationSuggestion {
  /** Recommended scene type ordering for highest quiz performance */
  recommendedSceneOrder: string[];
  /** Difficulty modifier to apply to quizzes (-0.2 to +0.2) */
  difficultyModifier: number;
  /** Confidence score (0.0–1.0) based on available data volume */
  confidence: number;
}

/** Minimum number of matching sessions required before we make suggestions */
const MIN_SESSIONS = 100;

/** Target average quiz score the optimizer tries to converge towards */
const TARGET_SCORE = 0.7;

// ---------------------------------------------------------------------------
// Service client
// ---------------------------------------------------------------------------

function getServiceClient(): ReturnType<typeof createClient<Database>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for data optimizer',
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TelemetryRow {
  scene_sequence: string[];
  quiz_scores: number[];
  completion_rate: number;
}

/**
 * Compute the average of an array of numbers. Returns 0 for empty arrays.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Serialize a scene sequence into a stable key for grouping.
 */
function sequenceKey(seq: string[]): string {
  return seq.join(',');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query aggregated pedagogy telemetry and return an optimization suggestion
 * for the given subject / level / language combination.
 *
 * Returns `null` when fewer than {@link MIN_SESSIONS} matching sessions exist
 * (not enough data to be statistically meaningful).
 */
export async function getOptimizationSuggestion(
  subject: string,
  level: string,
  language: string,
): Promise<OptimizationSuggestion | null> {
  const supabase = getServiceClient();

  // -----------------------------------------------------------------------
  // 1. Fetch matching sessions
  // -----------------------------------------------------------------------
  const { data: rows, error } = await supabase
    .from('pedagogy_telemetry')
    .select('scene_sequence, quiz_scores, completion_rate')
    .contains('subject_tags', [subject])
    .eq('level', level)
    .eq('language', language);

  if (error) {
    console.error('[DataOptimizer] Query failed:', error.message);
    return null;
  }

  const sessions = (rows ?? []) as TelemetryRow[];

  if (sessions.length < MIN_SESSIONS) {
    return null;
  }

  // -----------------------------------------------------------------------
  // 2. Group sessions by scene sequence and compute average quiz score
  // -----------------------------------------------------------------------
  const groups = new Map<string, { sequence: string[]; avgScores: number[] }>();

  for (const session of sessions) {
    const key = sequenceKey(session.scene_sequence ?? []);
    if (!groups.has(key)) {
      groups.set(key, {
        sequence: session.scene_sequence ?? [],
        avgScores: [],
      });
    }
    const group = groups.get(key)!; // safe — just set above
    const sessionAvg = mean(session.quiz_scores ?? []);
    if (!Number.isNaN(sessionAvg)) {
      group.avgScores.push(sessionAvg);
    }
  }

  // -----------------------------------------------------------------------
  // 3. Find the sequence with the highest average quiz score
  // -----------------------------------------------------------------------
  let bestSequence: string[] = [];
  let bestScore = -Infinity;

  for (const group of groups.values()) {
    if (group.avgScores.length === 0) continue;
    const avg = mean(group.avgScores);
    if (avg > bestScore) {
      bestScore = avg;
      bestSequence = group.sequence;
    }
  }

  // Fallback: if no valid sequence was found, return null
  if (bestSequence.length === 0 || !Number.isFinite(bestScore)) {
    return null;
  }

  // -----------------------------------------------------------------------
  // 4. Compute difficulty modifier
  //    - If average scores are above target → increase difficulty (positive)
  //    - If below target → decrease difficulty (negative)
  //    Clamped to [-0.2, +0.2]
  // -----------------------------------------------------------------------
  const allQuizScores = sessions.flatMap((s) => s.quiz_scores ?? []);
  const globalAvg = mean(allQuizScores);
  const rawModifier = globalAvg - TARGET_SCORE;
  const difficultyModifier = Math.max(-0.2, Math.min(0.2, rawModifier));

  // -----------------------------------------------------------------------
  // 5. Confidence: proportional to data volume, capped at 1.0
  //    100 sessions → 0.1, 500 → 0.5, 1000+ → 1.0
  // -----------------------------------------------------------------------
  const confidence = Math.min(1, sessions.length / 1000);

  return {
    recommendedSceneOrder: bestSequence,
    difficultyModifier: Math.round(difficultyModifier * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

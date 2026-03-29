// =============================================================================
// Qalem — Data-Driven Director
// Uses empirical discussion pattern data to suggest the next agent in a
// multi-agent conversation, with A/B testing against the classic LLM director.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('DataDrivenDirector');

/** Minimum sample size required before trusting a pattern. */
const MIN_SAMPLE_SIZE = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscussionPattern {
  agentSequence: string[];
  interventionTypes: string[];
  avgQuizScore: number;
  sampleSize: number;
}

// ---------------------------------------------------------------------------
// Supabase service client (server-side only)
// ---------------------------------------------------------------------------

function getServiceClient(): ReturnType<typeof createClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for data-driven director',
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Pattern retrieval
// ---------------------------------------------------------------------------

/**
 * Get the best discussion patterns for a given subject and language.
 *
 * Queries aggregated discussion_patterns rows that match the subject tag,
 * groups by agent_sequence, and returns patterns ordered by average quiz score.
 */
export async function getBestPatterns(
  subject: string,
  language: string,
): Promise<DiscussionPattern[]> {
  const supabase = getServiceClient();

  // Query discussion_patterns where subject_tags contains the subject
  // and language matches. We fetch raw rows and aggregate client-side
  // because Supabase JS doesn't support GROUP BY natively.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Service-role client without typed schema
  const { data, error } = await (supabase as any)
    .from('discussion_patterns')
    .select('agent_sequence, intervention_types, post_discussion_quiz_score')
    .contains('subject_tags', [subject])
    .eq('language', language)
    .not('post_discussion_quiz_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    log.error('[DataDrivenDirector] Failed to fetch patterns:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Aggregate by agent_sequence (serialized as JSON key)
  const groups = new Map<
    string,
    {
      agentSequence: string[];
      interventionTypes: string[];
      scores: number[];
    }
  >();

  for (const row of data as Array<{
    agent_sequence: string[];
    intervention_types: string[];
    post_discussion_quiz_score: number;
  }>) {
    const key = JSON.stringify(row.agent_sequence);
    const existing = groups.get(key);
    if (existing) {
      existing.scores.push(row.post_discussion_quiz_score);
    } else {
      groups.set(key, {
        agentSequence: row.agent_sequence,
        interventionTypes: row.intervention_types,
        scores: [row.post_discussion_quiz_score],
      });
    }
  }

  // Convert to DiscussionPattern and sort by avgQuizScore descending
  const patterns: DiscussionPattern[] = [];
  for (const group of groups.values()) {
    const avg = group.scores.reduce((s, v) => s + v, 0) / group.scores.length;
    patterns.push({
      agentSequence: group.agentSequence,
      interventionTypes: group.interventionTypes,
      avgQuizScore: Math.round(avg * 1000) / 1000,
      sampleSize: group.scores.length,
    });
  }

  patterns.sort((a, b) => b.avgQuizScore - a.avgQuizScore);
  return patterns;
}

// ---------------------------------------------------------------------------
// Next agent suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest the next agent based on empirical data.
 *
 * Algorithm:
 * 1. Finds patterns whose agent_sequence starts with the currentSequence prefix
 * 2. Among matching patterns with sampleSize >= MIN_SAMPLE_SIZE, picks the one
 *    with the highest avgQuizScore
 * 3. Returns the next agent in that pattern (the one right after the prefix)
 * 4. Returns null if no matching pattern or insufficient sample size
 */
export function suggestNextAgent(
  currentSequence: string[],
  bestPatterns: DiscussionPattern[],
  availableAgents: string[],
): string | null {
  const prefixLength = currentSequence.length;

  // Find patterns that start with the current sequence AND have a next agent
  const candidates = bestPatterns.filter((p) => {
    // Pattern must be longer than current sequence (to have a next agent)
    if (p.agentSequence.length <= prefixLength) return false;

    // Pattern must have sufficient sample size
    if (p.sampleSize < MIN_SAMPLE_SIZE) return false;

    // Pattern prefix must match current sequence
    for (let i = 0; i < prefixLength; i++) {
      if (p.agentSequence[i] !== currentSequence[i]) return false;
    }

    // Next agent must be available
    const nextAgent = p.agentSequence[prefixLength];
    return availableAgents.includes(nextAgent);
  });

  if (candidates.length === 0) {
    log.info(
      `[DataDrivenDirector] No matching pattern for prefix [${currentSequence.join(' -> ')}]`,
    );
    return null;
  }

  // Patterns are already sorted by avgQuizScore descending from getBestPatterns
  const best = candidates[0];
  const suggestion = best.agentSequence[prefixLength];
  log.info(
    `[DataDrivenDirector] Suggesting "${suggestion}" (score: ${best.avgQuizScore}, n=${best.sampleSize})`,
  );

  return suggestion;
}

// ---------------------------------------------------------------------------
// A/B testing
// ---------------------------------------------------------------------------

/**
 * Deterministic A/B test: 50% data-driven, 50% classic director.
 *
 * Uses a simple hash of the sessionId to ensure the same session always
 * gets the same variant, without requiring external state.
 */
export function shouldUseDataDriven(sessionId: string): boolean {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit integer
  }
  // Use absolute value and check if even/odd for a 50/50 split
  return Math.abs(hash) % 2 === 0;
}

// =============================================================================
// Qalem — Discussion Fingerprint Data Collector
// Collects anonymized multi-agent discussion patterns for the data-driven
// director pipeline.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscussionSession {
  userHash: string;
  stageId: string;
  agentSequence: string[]; // who spoke in order
  interventionTypes: string[]; // what type of intervention
  turnDurations: number[];
  totalTurns: number;
  postDiscussionQuizScore: number | null;
  engagementScore: number;
  subjectTags: string[];
  language: string;
  agentCount: number;
}

// Pure classification can be used without importing the service-role client.
export { classifyIntervention } from './discussion-observation';

// ---------------------------------------------------------------------------
// Engagement scoring
// ---------------------------------------------------------------------------

/**
 * Compute an engagement score from user messages.
 *
 * Heuristic: combines message frequency and average length into a 0.0-1.0 score.
 * - More messages = higher engagement
 * - Longer messages = higher engagement
 * - Shorter gaps between messages = higher engagement
 *
 * The score is normalized with soft caps so it stays in [0, 1].
 */
export function computeEngagement(
  userMessages: Array<{ length: number; timestamp: number }>,
): number {
  if (userMessages.length === 0) return 0;

  // Factor 1: message count (soft cap at 20 messages)
  const countScore = Math.min(userMessages.length / 20, 1);

  // Factor 2: average message length (soft cap at 300 chars)
  const totalLength = userMessages.reduce((sum, m) => sum + m.length, 0);
  const avgLength = totalLength / userMessages.length;
  const lengthScore = Math.min(avgLength / 300, 1);

  // Factor 3: response cadence (shorter gaps = more engaged)
  let cadenceScore = 0.5; // default if only one message
  if (userMessages.length >= 2) {
    const sorted = [...userMessages].sort((a, b) => a.timestamp - b.timestamp);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].timestamp - sorted[i - 1].timestamp);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    // Quick responses (<30s) score high; slow (>300s) score low
    cadenceScore = Math.max(0, Math.min(1, 1 - avgGap / 300));
  }

  // Weighted combination
  const raw = countScore * 0.4 + lengthScore * 0.3 + cadenceScore * 0.3;
  return Math.round(raw * 1000) / 1000; // 3 decimal places
}

// ---------------------------------------------------------------------------
// Supabase service client (server-side only)
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for discussion telemetry',
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

/**
 * Persist an anonymized discussion session to the database.
 * Called at the end of a multi-agent discussion when the user has given consent.
 *
 * Uses the Supabase service role -- this function must only run server-side.
 */
export async function collectDiscussionData(session: DiscussionSession): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from('discussion_patterns').insert({
    user_hash: session.userHash,
    stage_id: session.stageId,
    agent_sequence: session.agentSequence,
    intervention_types: session.interventionTypes,
    turn_durations: session.turnDurations,
    total_turns: session.totalTurns,
    post_discussion_quiz_score: session.postDiscussionQuizScore,
    engagement_score: session.engagementScore,
    subject_tags: session.subjectTags,
    language: session.language,
    agent_count: session.agentCount,
  });

  if (error) {
    // Log but do not throw -- telemetry must never break the application
    console.error('[DiscussionCollector] Failed to persist session:', error.message);
  }
}

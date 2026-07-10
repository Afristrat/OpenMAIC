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

// ---------------------------------------------------------------------------
// Intervention classification
// ---------------------------------------------------------------------------

/** Heuristic patterns for concrete examples. */
const EXAMPLE_PATTERNS = [
  /par exemple/i,
  /for example/i,
  /for instance/i,
  /مثلا/,
  /على سبيل المثال/,
  /e\.g\./i,
  /such as\b/i,
  /consider the case/i,
  /prenons le cas/i,
  /imaginons que/i,
];

/** Heuristic patterns for counter-arguments. */
const COUNTER_ARGUMENT_PATTERNS = [
  /\bmais\b/i,
  /\bcependant\b/i,
  /\bhowever\b/i,
  /\btoutefois\b/i,
  /\bnéanmoins\b/i,
  /\ben revanche\b/i,
  /لكن/,
  /ومع ذلك/,
  /\bon the other hand\b/i,
];

/** Heuristic patterns for synthesis. */
const SYNTHESIS_PATTERNS = [
  /en résumé/i,
  /to summarize/i,
  /in summary/i,
  /pour résumer/i,
  /en conclusion/i,
  /to conclude/i,
  /خلاصة/,
  /باختصار/,
  /\brecap\b/i,
  /\bto sum up\b/i,
];

/** Class Clown agent identifiers. */
const CLASS_CLOWN_IDS = ['显眼包', 'class-clown', 'class_clown'];

/**
 * Classify an agent's message into an intervention type using simple heuristics.
 *
 * Priority order:
 * 1. Agent is the class clown -> 'joke'
 * 2. Contains synthesis patterns -> 'synthesis'
 * 3. Contains counter-argument patterns -> 'counter_argument'
 * 4. Contains '?' -> 'question'
 * 5. Contains example patterns -> 'example'
 * 6. Agent role is 'teacher' and message is long (>200 chars) -> 'answer'
 * 7. Default -> 'answer'
 */
export function classifyIntervention(message: string, agentRole: string): string {
  // Class clown always tells jokes
  if (CLASS_CLOWN_IDS.some((id) => agentRole.toLowerCase().includes(id))) {
    return 'joke';
  }

  // Synthesis check
  if (SYNTHESIS_PATTERNS.some((p) => p.test(message))) {
    return 'synthesis';
  }

  // Counter-argument check
  if (COUNTER_ARGUMENT_PATTERNS.some((p) => p.test(message))) {
    return 'counter_argument';
  }

  // Question check
  if (message.includes('?')) {
    return 'question';
  }

  // Example check
  if (EXAMPLE_PATTERNS.some((p) => p.test(message))) {
    return 'example';
  }

  // Teacher with a long message -> answer
  if (agentRole.toLowerCase() === 'teacher' && message.length > 200) {
    return 'answer';
  }

  return 'answer';
}

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

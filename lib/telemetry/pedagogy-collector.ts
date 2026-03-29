// =============================================================================
// Qalem — Pedagogy Genome Data Collector
// Collects anonymized session telemetry for the Pedagogy Genome pipeline.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PedagogySession {
  userHash: string;
  stageId: string;
  sceneSequence: string[];
  sceneDurations: number[];
  quizScores: number[];
  completionRate: number;
  totalDuration: number;
  subjectTags: string[];
  language: string;
  level: string;
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Anonymization
// ---------------------------------------------------------------------------

/**
 * Hash a user ID with the configured salt using SHA-256.
 * Uses the Web Crypto API (available in Node 18+ and all modern browsers).
 */
export async function hashUserId(userId: string): Promise<string> {
  const salt = process.env.TELEMETRY_HASH_SALT ?? '';
  const data = new TextEncoder().encode(`${userId}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Supabase service client (server-side only)
// ---------------------------------------------------------------------------

// Service-role client for telemetry tables (pedagogy_telemetry, telemetry_consent).
// Uses untyped client because the Database interface format doesn't match Supabase's
// internal generic resolution for these service-only tables.
function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for pedagogy telemetry',
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
 * Persist an anonymized pedagogy session to the database.
 * Called at the end of a classroom session when the user has given consent.
 *
 * Uses the Supabase service role — this function must only run server-side.
 */
export async function collectPedagogyData(session: PedagogySession): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from('pedagogy_telemetry').insert({
    user_hash: session.userHash,
    stage_id: session.stageId,
    scene_sequence: session.sceneSequence,
    scene_durations: session.sceneDurations,
    quiz_scores: session.quizScores,
    completion_rate: session.completionRate,
    total_duration: session.totalDuration,
    subject_tags: session.subjectTags,
    language: session.language,
    level: session.level,
    agent_count: session.agentCount,
  });

  if (error) {
    // Log but do not throw — telemetry must never break the application
    console.error('[PedagogyCollector] Failed to persist session:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

/**
 * Check whether a user has given pedagogy telemetry consent.
 */
export async function hasConsent(userId: string): Promise<boolean> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('telemetry_consent')
    .select('pedagogy_consent')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;
  return data.pedagogy_consent === true;
}

/**
 * Set or update a user's pedagogy telemetry consent.
 */
export async function setConsent(userId: string, consent: boolean): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from('telemetry_consent').upsert(
    {
      user_id: userId,
      pedagogy_consent: consent,
      consented_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[PedagogyCollector] Failed to set consent:', error.message);
  }
}

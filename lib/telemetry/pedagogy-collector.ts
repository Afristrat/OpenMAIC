// =============================================================================
// Qalem — Pedagogy Genome Data Collector
// Collects consented, pseudonymized learning observations.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const learningSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    stageId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    sceneSequence: z
      .array(z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']))
      .min(1)
      .max(256),
    sceneDurations: z.array(z.number().int().min(0).max(86400)).min(1).max(256),
    quizScores: z.array(z.number().min(0).max(1)).max(512),
    completionRate: z.number().min(0).max(1),
    totalDuration: z.number().int().min(0).max(86400),
    subjectTags: z.array(z.string().max(100)).max(20),
    language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    agentCount: z.number().int().min(0).max(32),
    actionCounts: z
      .object({
        play: z.number().int().min(0).max(10000),
        pause: z.number().int().min(0).max(10000),
        seek: z.number().int().min(0).max(10000),
      })
      .strict(),
  })
  .strict()
  .refine(
    (session) => session.sceneSequence.length === session.sceneDurations.length,
    'Scene measures must align',
  );

export type PedagogySession = z.infer<typeof learningSessionSchema>;

// ---------------------------------------------------------------------------
// Pseudonymization
// ---------------------------------------------------------------------------

// The database creates a random hashed subject per user/organization. Its private
// mapping is erased on withdrawal; a raw user ID never enters the observation.

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
 * Persist a validated learning observation. The actor must come from requireAuth.
 * Consent and tenant membership are checked under lock by the database RPC.
 *
 * Uses the Supabase service role — this function must only run server-side.
 */
export async function collectPedagogyData(
  actorId: string,
  input: PedagogySession,
): Promise<boolean> {
  z.string().uuid().parse(actorId);
  const session = learningSessionSchema.parse(input);
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .rpc('record_consented_learning', {
      p_actor: actorId,
      p_session: session.sessionId,
      p_stage: session.stageId,
      p_payload: {
        scene_sequence: session.sceneSequence,
        scene_durations: session.sceneDurations,
        quiz_scores: session.quizScores,
        completion_rate: session.completionRate,
        total_duration: session.totalDuration,
        subject_tags: session.subjectTags,
        language: session.language,
        level: session.level,
        agent_count: session.agentCount,
        action_counts: session.actionCounts,
      },
    })
    .abortSignal(AbortSignal.timeout(5000));

  if (error) {
    throw new Error('Learning observation could not be recorded');
  }
  return data === true;
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

/**
 * Check whether a user has given pedagogy telemetry consent.
 */
export async function hasConsent(userId: string): Promise<boolean> {
  return (await readConsent(userId)) === true;
}

/** null means no choice yet; storage errors must not masquerade as refusal. */
export async function readConsent(userId: string): Promise<boolean | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('telemetry_consent')
    .select('pedagogy_consent')
    .eq('user_id', userId)
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();

  if (error) throw new Error('Consent storage unavailable');
  if (!data) return null;
  return data.pedagogy_consent === true;
}

/**
 * Set or update a user's pedagogy telemetry consent.
 */
export async function setConsent(userId: string, consent: boolean): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from('telemetry_consent')
    .upsert(
      {
        user_id: userId,
        pedagogy_consent: consent,
        consented_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .abortSignal(AbortSignal.timeout(5000));

  if (error) {
    throw new Error('Consent storage unavailable');
  }
}

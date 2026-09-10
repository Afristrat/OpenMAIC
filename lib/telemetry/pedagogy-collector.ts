// =============================================================================
// Qalem — Pedagogy Genome Data Collector
// Collects consented, pseudonymized learning observations.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { collectDiscussionData } from './discussion-collector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { learningSessionSchema, type PedagogySession } from './learning-observation-schema';
export { learningSessionSchema, type PedagogySession } from './learning-observation-schema';

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
      p_epoch: session.consentEpoch,
      p_org: session.orgId ?? null,
      p_payload: {
        scene_sequence: session.sceneSequence,
        scene_durations: session.sceneDurations,
        quiz_scores: session.quizScores,
        ...(session.sceneObservations ? { scene_observations: session.sceneObservations } : {}),
        completion_rate: session.completionRate,
        total_duration: session.totalDuration,
        // Context is derived from the persisted course/stage inside PostgreSQL.
        action_counts: session.actionCounts,
      },
    })
    .abortSignal(AbortSignal.timeout(5000));

  if (error || typeof data !== 'boolean') {
    throw new Error('Learning observation could not be recorded');
  }
  if (!data) return false;
  // Each write is idempotent and repeats authorization under lock. A partial
  // failure throws: the durable client entry is retried, never acknowledged early.
  for (const observation of session.discussions ?? []) {
    if (!session.orgId) throw new Error('Discussion organization required');
    if (
      !(await collectDiscussionData(actorId, {
        stageId: session.stageId,
        orgId: session.orgId,
        consentEpoch: session.consentEpoch,
        observation,
      }))
    )
      return false;
  }
  return true;
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
  return (await readConsentState(userId)).choice;
}

export async function readConsentState(
  userId: string,
): Promise<{ choice: boolean | null; epoch: string | null }> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('telemetry_consent')
    .select('pedagogy_consent, collection_epoch')
    .eq('user_id', userId)
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();

  if (error) throw new Error('Consent storage unavailable');
  if (!data) return { choice: null, epoch: null };
  const epoch = z.string().uuid().safeParse(data.collection_epoch);
  if (!epoch.success) throw new Error('Consent storage unavailable');
  return { choice: data.pedagogy_consent === true, epoch: epoch.data };
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

export async function readXapiConsent(userId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('telemetry_consent')
    .select('xapi_consent')
    .eq('user_id', userId)
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (error) throw new Error('Consent storage unavailable');
  return data?.xapi_consent === true;
}

export async function setXapiConsent(userId: string, consent: boolean): Promise<void> {
  const { error } = await getServiceClient()
    .from('telemetry_consent')
    .upsert(
      {
        user_id: userId,
        xapi_consent: consent,
        consented_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('Consent storage unavailable');
}

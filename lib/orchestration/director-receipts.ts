import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getActiveActorUserId, getActiveTenantId } from '@/lib/billing/usage-context';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import type { DirectorObservation } from './observed-director';

const log = createLogger('DirectorReceipts');
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createServiceSupabaseClient()
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Receipt unavailable');
    return data;
  } catch {
    // Failures remain unconfirmed, never counted as successful collection.
    log.warn('Director experiment receipt unavailable');
    return null;
  }
}

export async function beginDirectorReceipt(
  stageId: string | undefined,
  sceneId: string | null,
  classicAgent: string,
): Promise<string | null> {
  if (process.env.QALEM_DATA_DIRECTOR_ENABLED !== 'true') return null;
  const actor = getActiveActorUserId();
  const org = getActiveTenantId();
  if (
    !z.uuid().safeParse(actor).success ||
    !z.uuid().safeParse(org).success ||
    !stageId ||
    !sceneId
  )
    return null;
  const id = randomUUID();
  const result = await call('begin_director_receipt', {
    p_actor: actor,
    p_org: org,
    p_stage: stageId,
    p_scene: sceneId,
    p_id: id,
    p_classic: classicAgent,
  });
  return result === id ? id : null;
}

export async function selectDirectorReceipt(
  id: string | null,
  selectedAgent: string,
  observation: DirectorObservation | null,
  lookupMs: number,
): Promise<void> {
  if (!id || !observation) return;
  const suggestion =
    observation.suggestion?.agentId === selectedAgent ? observation.suggestion : null;
  await call('select_director_receipt', {
    p_actor: getActiveActorUserId(),
    p_id: id,
    p_selected: selectedAgent,
    p_reason:
      observation.reason === 'observed-pattern' && !suggestion
        ? 'no-compatible-pattern'
        : observation.reason,
    p_sample: suggestion?.sampleSize ?? null,
    p_score: suggestion?.observedMeanQuizScore ?? null,
    p_lookup_ms: Math.max(0, Math.round(lookupMs)),
  });
}

export async function finishDirectorReceipt(
  id: string | null,
  outcome: 'completed' | 'empty' | 'failed' | 'aborted',
): Promise<void> {
  if (!id) return;
  await call('finish_director_receipt', {
    p_actor: getActiveActorUserId(),
    p_id: id,
    p_outcome: outcome,
  });
}

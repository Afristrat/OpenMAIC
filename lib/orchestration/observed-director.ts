import { z } from 'zod';
import { getActiveActorUserId, getActiveTenantId } from '@/lib/billing/usage-context';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  getBestPatterns,
  shouldUseDataDriven,
  suggestNextAgent,
  type NextAgentSuggestion,
} from './data-driven-director';

export type DirectorObservation = {
  cohort: 'classic' | 'data-driven';
  suggestion: NextAgentSuggestion | null;
  reason: 'control' | 'observed-pattern' | 'no-compatible-pattern' | 'unavailable-context';
};

/** Same learner/tenant/classroom remains in one arm across stateless HTTP turns. */
export async function observeDirectorChoice(
  stageId: string | undefined,
  sequence: string[],
  eligibleAgentIds: string[],
  signal?: AbortSignal,
): Promise<DirectorObservation | null> {
  if (process.env.QALEM_DATA_DIRECTOR_ENABLED !== 'true' || signal?.aborted) return null;
  const actorId = getActiveActorUserId();
  const orgId = getActiveTenantId();
  if (
    !z.uuid().safeParse(actorId).success ||
    !z.uuid().safeParse(orgId).success ||
    !stageId ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(stageId)
  )
    return null;
  if (!shouldUseDataDriven(JSON.stringify([actorId, orgId, stageId])))
    return { cohort: 'classic', suggestion: null, reason: 'control' };
  const fallback: DirectorObservation = {
    cohort: 'data-driven',
    suggestion: null,
    reason: 'unavailable-context',
  };
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('courses')
      .select('language,outline')
      .eq('stage_id', stageId)
      .eq('status', 'ready')
      .limit(2)
      .abortSignal(AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]));
    const parsed = z
      .array(
        z.object({
          language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
          outline: z.object({
            analyticsContext: z.object({
              subjectTags: z
                .array(z.string().regex(/^[A-Za-z0-9_:-]{1,256}$/))
                .min(1)
                .max(20),
            }),
          }),
        }),
      )
      .length(1)
      .safeParse(data);
    if (error || !parsed.success || signal?.aborted) return fallback;
    const context = parsed.data[0];
    const patterns = await getBestPatterns(
      context.outline.analyticsContext.subjectTags[0],
      context.language,
      {
        actorId: actorId!,
        orgId: orgId!,
        stageIds: [stageId],
      },
    );
    if (signal?.aborted) return fallback;
    const suggestion = suggestNextAgent(sequence, patterns, eligibleAgentIds);
    return {
      cohort: 'data-driven',
      suggestion,
      reason: suggestion ? 'observed-pattern' : 'no-compatible-pattern',
    };
  } catch {
    return fallback;
  }
}

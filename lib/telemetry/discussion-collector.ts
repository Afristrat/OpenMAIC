import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { discussionObservationSchema } from './discussion-observation';

export { classifyIntervention } from './discussion-observation';

export const discussionSessionSchema = z
  .object({
    stageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    orgId: z.string().uuid(),
    consentEpoch: z.string().uuid(),
    observation: discussionObservationSchema.refine(
      (value) => value.postDiscussionQuiz === null,
      'Quiz linkage requires a verified persisted result, not a browser score',
    ),
  })
  .strict();

export type DiscussionSession = z.infer<typeof discussionSessionSchema>;

/** Server only. Actor comes from requireAuth, never from the submitted payload.
 * The RPC serializes admission against consent withdrawal and validates tenant,
 * scene and agents. Observations are pseudonymous and erasable, not anonymous.
 */
export async function collectDiscussionData(
  actorId: string,
  input: DiscussionSession,
): Promise<boolean> {
  z.string().uuid().parse(actorId);
  const session = discussionSessionSchema.parse(input);
  const { data, error } = await createServiceSupabaseClient(AbortSignal.timeout(5000)).rpc(
    'record_consented_discussion',
    {
      p_actor: actorId,
      p_stage: session.stageId,
      p_org: session.orgId,
      p_epoch: session.consentEpoch,
      p_observation: session.observation,
    },
  );
  if (error || typeof data !== 'boolean')
    throw new Error('Discussion observation could not be recorded');
  return data;
}

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const inputSchema = z.object({
  contextToken: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  stageId: z.string().min(1).max(4096),
  sceneId: z.string().min(1).max(4096),
  requestId: z.uuid(),
  score: z.number().min(0).max(100),
});

/** Server-only: userId comes from verified auth, score from server grading.
 * The database resolves recipient, permission and destination from the opaque
 * launch token. No client-provided LMS user or endpoint reaches the outbox.
 */
export async function enqueueLtiGrade(input: z.infer<typeof inputSchema>): Promise<string> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid LTI grade request');
  const values = parsed.data;
  const { data, error } = await createServiceSupabaseClient().rpc('enqueue_lti_grade', {
    p_token_hash: createHash('sha256').update(values.contextToken).digest('hex'),
    p_user_id: values.userId,
    p_stage_id: values.stageId,
    p_scene_id: values.sceneId,
    p_score: values.score,
    p_request_id: values.requestId,
  });
  if (error || !z.uuid().safeParse(data).success) throw new Error('LTI grade could not be queued');
  return data;
}

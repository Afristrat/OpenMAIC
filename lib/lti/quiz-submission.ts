import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { LtiAccessDenied, resolveLtiContext } from './context';
import { gradeLtiQuiz, LtiGradingYield } from './quiz-grading';

export const ltiSubmissionSchema = z
  .object({
    stageId: z.string().min(1).max(4096),
    sceneId: z.string().min(1).max(4096),
    requestId: z.uuid(),
    language: z.enum(['fr-FR', 'ar-MA', 'en-US']).default('en-US'),
    answers: z
      .record(
        z.string().min(1).max(256),
        z.union([z.string().max(20000), z.array(z.string().max(20000)).max(100)]),
      )
      .refine((answers) => Object.keys(answers).length <= 100),
  })
  .strict();
const gradeSchema = z.object({
  score: z.number().finite().min(0).max(100),
  results: z
    .array(
      z.object({
        questionId: z.string(),
        correct: z.boolean().nullable(),
        status: z.enum(['correct', 'incorrect']),
        earned: z.number().finite().nonnegative(),
        aiComment: z.string().optional(),
      }),
    )
    .min(1)
    .max(100),
});
const claimSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('busy') }),
  z.object({ status: z.literal('completed'), result: gradeSchema, outboxId: z.uuid() }),
  z.object({
    status: z.literal('claimed'),
    id: z.uuid(),
    leaseId: z.uuid(),
    content: z.unknown(),
    answers: z.unknown(),
  }),
]);

export class LtiSubmissionConflict extends Error {
  constructor() {
    super('LTI submission cannot be replayed');
  }
}
function checkRpc(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new LtiAccessDenied();
  if (error.code === '22023' || error.code === '40001') throw new LtiSubmissionConflict();
  throw new Error('LTI submission storage unavailable');
}

/** User and token are from verified Auth and the httpOnly cookie, respectively. */
export async function submitLtiQuiz(
  userId: string,
  token: string,
  input: z.infer<typeof ltiSubmissionSchema>,
) {
  const body = ltiSubmissionSchema.parse(input);
  const context = await resolveLtiContext({ userId, token, stageId: body.stageId });
  if (!context.gradingEnabled) throw new LtiAccessDenied();
  const service = createServiceSupabaseClient();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const started = await service.rpc('begin_lti_quiz_attempt', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_stage_id: body.stageId,
    p_scene_id: body.sceneId,
    p_request_id: body.requestId,
    p_answers: body.answers,
  });
  checkRpc(started.error);
  const claim = claimSchema.parse(started.data);
  if (claim.status !== 'claimed') return claim;
  let grade: z.infer<typeof gradeSchema>;
  try {
    const saved = await service
      .from('lti_quiz_attempts')
      .select('partial_results')
      .eq('id', claim.id)
      .eq('lease_id', claim.leaseId)
      .single();
    if (saved.error || !saved.data) throw new Error('LTI checkpoint unavailable');
    // A server-issued lease identifies actual model work. Completed replays never enter this block.
    const headers = new Headers({ 'idempotency-key': `lti-${claim.id}-${claim.leaseId}` });
    grade = gradeSchema.parse(
      await runWithUsageMeteringContext(headers, userId, context.orgId, () =>
        gradeLtiQuiz(claim.content, claim.answers, body.language, {
          results: saved.data.partial_results,
          save: async (result) => {
            const checkpoint = await service.rpc('checkpoint_lti_quiz_answer', {
              p_id: claim.id,
              p_lease: claim.leaseId,
              p_question_id: result.questionId,
              p_result: result,
            });
            checkRpc(checkpoint.error);
            if (checkpoint.data !== true) throw new Error('LTI checkpoint not acknowledged');
          },
        }),
      ),
    );
  } catch (error) {
    // Retain the immutable answers/snapshot, but allow the learner to retry a failed correction.
    const released = await service
      .from('lti_quiz_attempts')
      .update({ lease_expires_at: new Date().toISOString() })
      .eq('id', claim.id)
      .eq('lease_id', claim.leaseId);
    if (released.error) throw new Error('LTI submission storage unavailable');
    if (error instanceof LtiGradingYield) return { status: 'busy' as const };
    throw new Error('LTI quiz correction unavailable');
  }
  const completed = await service.rpc('complete_lti_quiz_attempt', {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_id: claim.id,
    p_lease: claim.leaseId,
    p_result: grade,
  });
  checkRpc(completed.error);
  const outboxId = z.uuid().parse(completed.data);
  return { status: 'completed' as const, result: grade, outboxId };
}

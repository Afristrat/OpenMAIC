import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { gradeLtiQuiz, LtiGradingYield } from '@/lib/lti/quiz-grading';
import { quizGradeSchema } from './grading';

export const classroomSubmissionSchema = z
  .object({
    requestId: z.uuid(),
    orgId: z.uuid(),
    stageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    sceneId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    answers: z
      .record(
        z.string().min(1).max(256),
        z.union([z.string().max(20000), z.array(z.string().max(20000)).max(100)]),
      )
      .refine((answers) => Object.keys(answers).length <= 100),
  })
  .strict();
const claimSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('busy') }),
  z.object({ status: z.literal('completed'), attemptId: z.uuid(), result: quizGradeSchema }),
  z.object({
    status: z.literal('claimed'),
    id: z.uuid(),
    leaseId: z.uuid(),
    content: z.unknown(),
    answers: z.unknown(),
    partialResults: z.unknown(),
    language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
  }),
]);
export class ClassroomQuizError extends Error {
  constructor(readonly status: number) {
    super('Classroom quiz submission unavailable');
  }
}
function checked(error: { code?: string } | null) {
  if (error)
    throw new ClassroomQuizError(
      error.code === '42501' ? 403 : ['22023', '40001'].includes(error.code ?? '') ? 409 : 503,
    );
}

/** Actor is supplied by requireAuth. Only the DB supplies the authorized quiz/correction snapshot. */
export async function submitClassroomQuiz(
  actorId: string,
  input: z.infer<typeof classroomSubmissionSchema>,
) {
  z.uuid().parse(actorId);
  const body = classroomSubmissionSchema.parse(input);
  const service = createServiceSupabaseClient();
  const started = await service
    .rpc('begin_classroom_quiz_attempt', {
      p_actor: actorId,
      p_org: body.orgId,
      p_stage: body.stageId,
      p_scene: body.sceneId,
      p_request: body.requestId,
      p_answers: body.answers,
    })
    .abortSignal(AbortSignal.timeout(5000));
  checked(started.error);
  const claim = claimSchema.parse(started.data);
  if (claim.status !== 'claimed') return claim;
  let result: z.infer<typeof quizGradeSchema>;
  try {
    // Reuse the same persisted-content grader as LTI, without requiring an LMS launch.
    const headers = new Headers({ 'idempotency-key': `quiz-${claim.id}-${claim.leaseId}` });
    result = quizGradeSchema.parse(
      await runWithUsageMeteringContext(headers, actorId, body.orgId, () =>
        gradeLtiQuiz(claim.content, claim.answers, claim.language, {
          results: claim.partialResults,
          save: async (correction) => {
            const saved = await service
              .rpc('checkpoint_classroom_quiz_answer', {
                p_actor: actorId,
                p_id: claim.id,
                p_lease: claim.leaseId,
                p_question: correction.questionId,
                p_result: correction,
              })
              .abortSignal(AbortSignal.timeout(5000));
            checked(saved.error);
            if (saved.data !== true) throw new ClassroomQuizError(503);
          },
        }),
      ),
    );
  } catch (error) {
    const released = await service
      .from('classroom_quiz_attempts')
      .update({ lease_expires_at: new Date().toISOString() })
      .eq('id', claim.id)
      .eq('user_id', actorId)
      .eq('lease_id', claim.leaseId)
      .abortSignal(AbortSignal.timeout(5000));
    checked(released.error);
    if (error instanceof LtiGradingYield) return { status: 'busy' as const };
    throw error instanceof ClassroomQuizError ? error : new ClassroomQuizError(503);
  }
  const completed = await service
    .rpc('complete_classroom_quiz_attempt', {
      p_actor: actorId,
      p_id: claim.id,
      p_lease: claim.leaseId,
      p_result: result,
    })
    .abortSignal(AbortSignal.timeout(5000));
  checked(completed.error);
  if (z.uuid().parse(completed.data) !== claim.id) throw new ClassroomQuizError(503);
  return { status: 'completed' as const, attemptId: claim.id, result };
}

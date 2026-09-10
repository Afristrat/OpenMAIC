import { z } from 'zod';
import { quizGradeSchema } from './grading';
import { sendQuizSubmission, type LtiQuizAttempt } from './lti-client';
import { drainLearningObservations } from '@/lib/telemetry/learning-observation-drain';

const resultSchema = quizGradeSchema.extend({
  success: z.literal(true),
  status: z.literal('completed'),
  attemptId: z.uuid(),
});
export async function sendClassroomQuizAttempt(
  orgId: string,
  stageId: string,
  sceneId: string,
  attempt: LtiQuizAttempt,
  signal: AbortSignal,
) {
  await drainLearningObservations({ orgId, stageId }, signal);
  return resultSchema.parse(
    await sendQuizSubmission(
      '/api/quiz-attempts',
      {
        orgId,
        stageId,
        sceneId,
        requestId: attempt.requestId,
        answers: attempt.answers,
      },
      signal,
    ),
  );
}

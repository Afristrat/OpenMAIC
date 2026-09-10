import { z } from 'zod';
import type { QuizAnswers } from './persistence';

const attemptSchema = z.object({
  requestId: z.uuid(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
});
export type LtiQuizAttempt = z.infer<typeof attemptSchema>;
const resultSchema = z.object({
  success: z.literal(true),
  status: z.literal('queued'),
  deliveryId: z.uuid(),
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
const key = (scope: string) => `ltiQuizAttempt:${scope}`;

export function readLtiAttempt(scope: string): LtiQuizAttempt | null {
  const raw = localStorage.getItem(key(scope));
  return raw ? attemptSchema.parse(JSON.parse(raw)) : null;
}
export function saveLtiAttempt(
  scope: string,
  answers: QuizAnswers,
  language: string,
): LtiQuizAttempt {
  const existing = readLtiAttempt(scope);
  if (existing) return existing;
  const attempt = attemptSchema.parse({ requestId: crypto.randomUUID(), answers, language });
  const serialized = JSON.stringify(attempt);
  localStorage.setItem(key(scope), serialized);
  if (localStorage.getItem(key(scope)) !== serialized)
    throw new Error('LTI attempt storage unavailable');
  return attempt;
}
export function clearLtiAttempt(scope: string): void {
  localStorage.removeItem(key(scope));
}

export async function readLtiClassroomContext(stageId: string, signal: AbortSignal) {
  const response = await fetch(`/api/lti/context?stageId=${encodeURIComponent(stageId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error('LTI context unavailable');
  return z
    .discriminatedUnion('active', [
      z.object({ success: z.literal(true), active: z.literal(false) }),
      z.object({
        success: z.literal(true),
        active: z.literal(true),
        gradingEnabled: z.literal(true),
        launchId: z.uuid(),
      }),
    ])
    .parse(await response.json());
}

/** Replaying uses exactly the saved answers and request ID, never a browser score. */
export async function sendLtiQuizAttempt(
  stageId: string,
  sceneId: string,
  attempt: LtiQuizAttempt,
  signal: AbortSignal,
) {
  return resultSchema.parse(
    await sendQuizSubmission('/api/lti/quiz', { stageId, sceneId, ...attempt }, signal),
  );
}

/** Shared resumable HTTP protocol; each caller validates its own final acknowledgement. */
export async function sendQuizSubmission(
  endpoint: '/api/lti/quiz' | '/api/quiz-attempts',
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  for (let poll = 0; poll < 220; poll++) {
    signal.throwIfAborted();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(305000)]),
    });
    if (!response.ok) throw new Error('Quiz submission unavailable');
    const data: unknown = await response.json();
    if (response.status !== 202) return data;
    z.object({ success: z.literal(true), status: z.literal('grading') }).parse(data);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 3000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw new Error('Quiz correction still pending');
}

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import {
  classroomSubmissionSchema,
  ClassroomQuizError,
  submitClassroomQuiz,
} from '@/lib/quiz/classroom-submission';

export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reply = (body: object, status: number) => NextResponse.json(body, { status, headers });
  const auth = await requireAuth(request);
  if (auth.response) {
    auth.response.headers.set('Cache-Control', headers['Cache-Control']);
    return auth.response;
  }
  if (
    request.headers.get('origin') !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  )
    return reply({ error: 'Forbidden origin' }, 403);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return reply({ error: 'JSON required' }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'Submission required' }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  let body: unknown;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new Error('Body timeout');
      if (done) break;
      size += value.byteLength;
      if (size > 2097152) return reply({ error: 'Submission too large' }, 413);
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return reply({ error: 'Invalid submission' }, 400);
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const parsed = classroomSubmissionSchema.safeParse(body);
  if (!parsed.success) return reply({ error: 'Invalid submission' }, 400);
  try {
    const result = await submitClassroomQuiz(auth.user.id, parsed.data);
    if (result.status === 'busy') {
      const response = reply({ success: true, status: 'grading' }, 202);
      response.headers.set('Retry-After', '3');
      return response;
    }
    return reply(
      { success: true, status: 'completed', attemptId: result.attemptId, ...result.result },
      200,
    );
  } catch (error) {
    return reply(
      { error: 'Quiz submission unavailable' },
      error instanceof ClassroomQuizError ? error.status : 503,
    );
  }
}

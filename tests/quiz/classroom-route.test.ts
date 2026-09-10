import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), submit: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/quiz/classroom-submission', async (original) => ({
  ...(await original<typeof import('@/lib/quiz/classroom-submission')>()),
  submitClassroomQuiz: mocks.submit,
}));
import { POST } from '@/app/api/quiz-attempts/route';
import { ClassroomQuizError } from '@/lib/quiz/classroom-submission';
const id = '00000000-0047-4000-8000-000000000001';
const body = { requestId: id, orgId: id, stageId: 'stage', sceneId: 'quiz', answers: { q: 'a' } };
function request(payload: unknown = body, origin = 'https://qalem.test') {
  return new NextRequest('https://qalem.test/api/quiz-attempts', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.test');
  mocks.auth.mockResolvedValue({ user: { id } });
  mocks.submit.mockResolvedValue({ status: 'busy' });
});
it('requires authentication, same origin and only immutable answer input', async () => {
  mocks.auth.mockResolvedValueOnce({
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request(body, 'https://foreign.test'))).status).toBe(403);
  expect((await POST(request({ ...body, score: 100 }))).status).toBe(400);
  expect(mocks.submit).not.toHaveBeenCalled();
});
it('returns a resumable acknowledgement and only a persisted final receipt', async () => {
  const busy = await POST(request());
  expect(busy.status).toBe(202);
  expect(busy.headers.get('retry-after')).toBe('3');
  expect(busy.headers.get('cache-control')).toContain('no-store');
  expect(mocks.submit).toHaveBeenCalledWith(id, body);
  const result = {
    score: 0,
    results: [{ questionId: 'q', correct: false, status: 'incorrect', earned: 0 }],
  };
  mocks.submit.mockResolvedValueOnce({ status: 'completed', attemptId: id, result });
  const completed = await POST(request());
  expect(completed.status).toBe(200);
  expect(await completed.json()).toEqual({
    success: true,
    status: 'completed',
    attemptId: id,
    ...result,
  });
});
it('bounds bodies and does not disclose internal errors', async () => {
  expect((await POST(request({ ...body, answers: { q: 'x'.repeat(2097152) } }))).status).toBe(413);
  for (const error of [new ClassroomQuizError(403), new Error('private provider details')]) {
    mocks.submit.mockRejectedValueOnce(error);
    const response = await POST(request());
    expect(response.status).toBe(error instanceof ClassroomQuizError ? 403 : 503);
    expect(await response.text()).not.toContain('private provider details');
  }
});

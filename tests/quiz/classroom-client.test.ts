import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendClassroomQuizAttempt } from '@/lib/quiz/classroom-client';
describe('classroom quiz transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends answers and request identity, never the answer key or score', async () => {
    const id = '00000000-0047-4000-8000-000000000001';
    const response = {
      success: true,
      status: 'completed',
      attemptId: id,
      score: 0,
      results: [{ questionId: 'q', earned: 0, correct: false, status: 'incorrect' }],
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetch);
    expect(
      await sendClassroomQuizAttempt(
        id,
        'stage',
        'quiz',
        { requestId: id, answers: { q: 'a' }, language: 'ar-MA' },
        new AbortController().signal,
      ),
    ).toEqual(response);
    expect(fetch.mock.calls[0][0]).toBe('/api/quiz-attempts');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      orgId: id,
      stageId: 'stage',
      sceneId: 'quiz',
      requestId: id,
      answers: { q: 'a' },
    });
  });
});

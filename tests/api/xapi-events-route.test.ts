import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  course: vi.fn(),
  session: vi.fn(),
  queueQuiz: vi.fn(),
}));

vi.mock('@/lib/anchoring/xapi-outbox', () => ({
  enqueueAnchorQuizStatement: mocks.queueQuiz,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'courses') {
        return { select: () => ({ eq: () => ({ maybeSingle: mocks.course }) }) };
      }
      if (table === 'live_sessions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({ limit: () => ({ maybeSingle: mocks.session }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

async function submit(body: unknown) {
  const { POST } = await import('@/app/api/xapi/events/route');
  return POST(
    new Request('https://qalem.ma/api/xapi/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as NextRequest,
  );
}

describe('anchoring xAPI event API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.course.mockResolvedValue({ data: { id: 'course-1' }, error: null });
    mocks.session.mockResolvedValue({ data: { id: 'session-1' }, error: null });
    mocks.queueQuiz.mockResolvedValue(true);
  });

  it('rejects malformed and unauthenticated events', async () => {
    expect((await submit({ type: 'quiz_answered' })).status).toBe(400);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect(
      (
        await submit({
          type: 'quiz_answered',
          stageId: 'stage-1',
          sceneId: 'quiz-1',
          score: 80,
        })
      ).status,
    ).toBe(401);
  });

  it('binds a quiz answer to the learner latest session', async () => {
    const response = await submit({
      type: 'quiz_answered',
      stageId: 'stage-1',
      sceneId: 'quiz-1',
      score: 80,
    });

    expect(response.status).toBe(202);
    expect(mocks.queueQuiz).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: 'user-1',
      sceneId: 'quiz-1',
      score: 80,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), release: vi.fn(), grade: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    rpc: (name: string, args: unknown) => ({ abortSignal: () => mocks.rpc(name, args) }),
    from: () => ({
      update: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ abortSignal: mocks.release }) }) }),
      }),
    }),
  }),
}));
vi.mock('@/lib/lti/quiz-grading', () => ({
  gradeLtiQuiz: mocks.grade,
  LtiGradingYield: class extends Error {},
}));
import { classroomSubmissionSchema, submitClassroomQuiz } from '@/lib/quiz/classroom-submission';
const actor = '00000000-0047-4000-8000-000000000001';
const id = '00000000-0047-4000-8000-000000000002';
const lease = '00000000-0047-4000-8000-000000000003';
const input = {
  requestId: id,
  orgId: lease,
  stageId: 'stage',
  sceneId: 'quiz',
  answers: { q: 'b' },
};
const result = {
  score: 100,
  results: [{ questionId: 'q', earned: 1, correct: true, status: 'correct' }],
};
describe('ordinary quiz server authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grade.mockResolvedValue(result);
    mocks.release.mockResolvedValue({ error: null });
    mocks.rpc.mockImplementation(async (name) => ({
      error: null,
      data:
        name === 'begin_classroom_quiz_attempt'
          ? {
              status: 'claimed',
              id,
              leaseId: lease,
              content: { persisted: true },
              answers: { q: 'b' },
              language: 'ar-MA',
              partialResults: {},
            }
          : id,
    }));
  });
  it('grades only the leased snapshot and acknowledges persisted completion', async () => {
    expect(await submitClassroomQuiz(actor, input)).toEqual({
      status: 'completed',
      attemptId: id,
      result,
    });
    expect(mocks.grade).toHaveBeenCalledWith(
      { persisted: true },
      { q: 'b' },
      'ar-MA',
      expect.objectContaining({ results: {} }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith('complete_classroom_quiz_attempt', {
      p_actor: actor,
      p_id: id,
      p_lease: lease,
      p_result: result,
    });
    expect(classroomSubmissionSchema.safeParse({ ...input, score: 100 }).success).toBe(false);
  });
  it('does not regrade a replay or a busy lease', async () => {
    for (const data of [{ status: 'busy' }, { status: 'completed', attemptId: id, result }]) {
      mocks.rpc.mockResolvedValueOnce({ data, error: null });
      expect(await submitClassroomQuiz(actor, input)).toEqual(data);
    }
    expect(mocks.grade).not.toHaveBeenCalled();
  });
  it('distinguishes denied, conflicting and unavailable state without fabricating a score', async () => {
    for (const [code, status] of [
      ['42501', 403],
      ['22023', 409],
      ['XX000', 503],
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      await expect(submitClassroomQuiz(actor, input)).rejects.toMatchObject({ status });
    }
    mocks.grade.mockRejectedValueOnce(new Error('private model detail'));
    await expect(submitClassroomQuiz(actor, input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.release).toHaveBeenCalled();
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === 'complete_classroom_quiz_attempt'),
    ).toHaveLength(0);
  });
});

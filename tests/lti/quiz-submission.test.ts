import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitLtiQuiz } from '@/lib/lti/quiz-submission';
import { LtiGradingYield } from '@/lib/lti/quiz-grading';
import type { QuestionResult } from '@/lib/quiz/grading';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), resolve: vi.fn(), grade: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('@/lib/lti/context', async (original) => ({
  ...(await original<typeof import('@/lib/lti/context')>()),
  resolveLtiContext: mocks.resolve,
}));
vi.mock('@/lib/lti/quiz-grading', async (original) => ({
  ...(await original<typeof import('@/lib/lti/quiz-grading')>()),
  gradeLtiQuiz: mocks.grade,
}));
function checkpointsQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { partial_results: {} }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
const id = '00000000-0034-4000-8000-000000000001';
const body = {
  stageId: 'stage',
  sceneId: 'quiz',
  requestId: id,
  answers: { q: 'answer' },
  language: 'fr-FR' as const,
};
const grade = {
  score: 80,
  results: [{ questionId: 'q', earned: 0.8, correct: true, status: 'correct' }],
};
const claim = {
  status: 'claimed',
  id,
  leaseId: id,
  content: { server: 'snapshot' },
  answers: { q: 'persisted answer' },
};
describe('durable LTI quiz submission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolve.mockResolvedValue({ orgId: id, gradingEnabled: true });
    mocks.grade.mockResolvedValue(grade);
    mocks.from.mockReturnValue(checkpointsQuery());
  });
  it('grades only the database snapshot and atomically completes the correction', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: claim, error: null })
      .mockResolvedValueOnce({ data: id, error: null });
    expect(await submitLtiQuiz(id, 'a'.repeat(64), body)).toEqual({
      status: 'completed',
      result: grade,
      outboxId: id,
    });
    expect(mocks.grade).toHaveBeenCalledWith(claim.content, claim.answers, 'fr-FR', {
      results: {},
      save: expect.any(Function),
    });
    expect(mocks.rpc.mock.calls[1][0]).toBe('complete_lti_quiz_attempt');
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_id: id, p_lease: id, p_result: grade });
  });
  it.each([{ status: 'busy' }, { status: 'completed', result: grade, outboxId: id }])(
    'never regrades a busy or completed attempt: %j',
    async (state) => {
      mocks.rpc.mockResolvedValue({ data: state, error: null });
      expect(await submitLtiQuiz(id, 'a'.repeat(64), body)).toEqual(state);
      expect(mocks.grade).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it('denies unauthorized access before any attempt is stored or graded', async () => {
    mocks.resolve.mockRejectedValue(new Error('denied'));
    await expect(submitLtiQuiz(id, 'a'.repeat(64), body)).rejects.toThrow('denied');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.grade).not.toHaveBeenCalled();
  });
  it('retains the attempt but releases its own lease after a model failure', async () => {
    mocks.rpc.mockResolvedValue({ data: claim, error: null });
    mocks.grade.mockRejectedValue(new Error('provider private detail'));
    const update = { update: vi.fn(), eq: vi.fn() };
    update.update.mockReturnValue(update);
    update.eq.mockReturnValueOnce(update).mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValueOnce(checkpointsQuery()).mockReturnValueOnce(update);
    await expect(submitLtiQuiz(id, 'a'.repeat(64), body)).rejects.toThrow(
      'LTI quiz correction unavailable',
    );
    expect(update.eq.mock.calls).toEqual([
      ['id', id],
      ['lease_id', id],
    ]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not release or discard a correction after an uncertain completion write', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: claim, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '08006' } });
    await expect(submitLtiQuiz(id, 'a'.repeat(64), body)).rejects.toThrow(
      'LTI submission storage unavailable',
    );
    expect(mocks.from).toHaveBeenCalledTimes(1); // Read checkpoints, never release an uncertain completion.
  });
  it('yields without a final score and releases only its own lease for the next slice', async () => {
    mocks.rpc.mockResolvedValue({ data: claim, error: null });
    mocks.grade.mockRejectedValue(new LtiGradingYield());
    const update = { update: vi.fn(), eq: vi.fn() };
    update.update.mockReturnValue(update);
    update.eq.mockReturnValueOnce(update).mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValueOnce(checkpointsQuery()).mockReturnValueOnce(update);
    expect(await submitLtiQuiz(id, 'a'.repeat(64), body)).toEqual({ status: 'busy' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(update.eq.mock.calls).toEqual([
      ['id', id],
      ['lease_id', id],
    ]);
  });
  it('requires the checkpoint acknowledgement before completing the final grade', async () => {
    const correction: QuestionResult = {
      questionId: 'q',
      earned: 0.8,
      correct: true,
      status: 'correct',
    };
    mocks.grade.mockImplementation(
      async (
        _content: unknown,
        _answers: unknown,
        _language: string,
        checkpoints: { save: (result: QuestionResult) => Promise<void> },
      ) => {
        await checkpoints.save(correction);
        return grade;
      },
    );
    mocks.rpc
      .mockResolvedValueOnce({ data: claim, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: id, error: null });
    await submitLtiQuiz(id, 'a'.repeat(64), body);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      'begin_lti_quiz_attempt',
      'checkpoint_lti_quiz_answer',
      'complete_lti_quiz_attempt',
    ]);
    expect(mocks.rpc.mock.calls[1][1]).toEqual({
      p_id: id,
      p_lease: id,
      p_question_id: 'q',
      p_result: correction,
    });
  });
});

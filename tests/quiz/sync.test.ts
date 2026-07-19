import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncQuizResultToSupabase } from '@/lib/quiz/sync';
import { tryCreateClient } from '@/lib/supabase/client';
import type { QuizAnswer } from '@/lib/supabase/types';

vi.mock('@/lib/supabase/client', () => ({
  tryCreateClient: vi.fn(),
}));

const answers: QuizAnswer[] = [
  { questionId: 'q1', userAnswer: 'a', correct: true, timestamp: '2026-07-17T00:00:00.000Z' },
];

describe('syncQuizResultToSupabase', () => {
  afterEach(() => vi.restoreAllMocks());

  it('inserts the quiz result into Supabase quiz_results', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
    vi.mocked(tryCreateClient).mockReturnValue({ from: fromMock } as never);

    await syncQuizResultToSupabase({
      userId: 'u1',
      stageId: 's1',
      sceneId: 'sc1',
      answers,
      score: 80,
    });

    expect(fromMock).toHaveBeenCalledWith('quiz_results');
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'u1',
      stage_id: 's1',
      scene_id: 'sc1',
      answers,
      score: 80,
    });
  });

  it('does nothing (never throws) when Supabase is not configured', async () => {
    vi.mocked(tryCreateClient).mockReturnValue(null);

    await expect(
      syncQuizResultToSupabase({ userId: 'u1', stageId: 's1', sceneId: 'sc1', answers, score: 80 }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the insert fails', async () => {
    const insertMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.mocked(tryCreateClient).mockReturnValue({
      from: () => ({ insert: insertMock }),
    } as never);

    await expect(
      syncQuizResultToSupabase({ userId: 'u1', stageId: 's1', sceneId: 'sc1', answers, score: 80 }),
    ).resolves.toBeUndefined();
  });
});

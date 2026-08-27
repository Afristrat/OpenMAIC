import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';
import type { QuizQuestion } from '@/lib/types/stage';
import type { QuizAnswer } from '@/lib/supabase/types';
import type { ReviewCardRecord } from '@/lib/utils/database';

const databaseMocks = vi.hoisted(() => ({
  bulkGet: vi.fn(),
  bulkPut: vi.fn(),
}));

vi.mock('@/lib/utils/database', () => ({
  db: { reviewCards: databaseMocks },
}));
vi.mock('@/lib/supabase/client', () => ({
  tryCreateClient: vi.fn(),
}));

import { persistQuizCompletion, syncQuizResultToSupabase } from '@/lib/quiz/sync';
import { tryCreateClient } from '@/lib/supabase/client';

const answers: QuizAnswer[] = [
  { questionId: 'q1', userAnswer: 'a', correct: true, timestamp: '2026-07-17T00:00:00.000Z' },
];

describe('syncQuizResultToSupabase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts one stable quiz result into Supabase', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    vi.mocked(tryCreateClient).mockReturnValue({ from } as never);

    await syncQuizResultToSupabase({
      userId: 'u1',
      stageId: 's1',
      sceneId: 'sc1',
      answers,
      score: 80,
    });

    expect(from).toHaveBeenCalledWith('quiz_results');
    expect(upsert).toHaveBeenCalledWith(
      {
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        user_id: 'u1',
        stage_id: 's1',
        scene_id: 'sc1',
        answers,
        score: 80,
      },
      { onConflict: 'id' },
    );
  });

  it('does nothing when Supabase is not configured', async () => {
    vi.mocked(tryCreateClient).mockReturnValue(null);

    await expect(
      syncQuizResultToSupabase({ userId: 'u1', stageId: 's1', sceneId: 'sc1', answers, score: 80 }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the upsert fails', async () => {
    expectConsoleMessages({
      warn: ['[WARN] [QuizSync] Quiz result sync unreachable for scene sc1: Error: network down'],
    });
    const upsert = vi.fn().mockRejectedValue(new Error('network down'));
    vi.mocked(tryCreateClient).mockReturnValue({ from: () => ({ upsert }) } as never);

    await expect(
      syncQuizResultToSupabase({ userId: 'u1', stageId: 's1', sceneId: 'sc1', answers, score: 80 }),
    ).resolves.toBeUndefined();
  });
});

describe('persistQuizCompletion', () => {
  const localCards = new Map<string, ReviewCardRecord>();
  const remoteCardIds = new Set<string>();

  const questions: QuizQuestion[] = [
    { id: 'correct', type: 'single', question: 'Correct?', answer: ['A'], points: 1 },
    { id: 'error', type: 'single', question: 'Error?', answer: ['B'], points: 1 },
    {
      id: 'hesitant',
      type: 'short_answer',
      question: 'Explain?',
      answer: ['Expected explanation'],
      points: 2,
    },
  ];
  const submittedAnswers = { correct: 'A', error: 'A', hesitant: 'Partial explanation' };
  const results = [
    { questionId: 'correct', correct: true, status: 'correct' as const, earned: 1 },
    { questionId: 'error', correct: false, status: 'incorrect' as const, earned: 0 },
    { questionId: 'hesitant', correct: false, status: 'incorrect' as const, earned: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localCards.clear();
    remoteCardIds.clear();
    databaseMocks.bulkGet.mockImplementation(async (ids: string[]) =>
      ids.map((id) => localCards.get(id)),
    );
    databaseMocks.bulkPut.mockImplementation(async (records: ReviewCardRecord[]) => {
      for (const record of records) localCards.set(record.id, record);
    });
  });

  it('stores error and hesitation in IndexedDB and Supabase without resetting on replay', async () => {
    const insertReviewCards = vi.fn().mockImplementation(async (rows: Array<{ id: string }>) => {
      for (const row of rows) remoteCardIds.add(row.id);
      return { error: null };
    });
    const upsertQuizResult = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'review_cards') {
        return {
          select: () => ({
            in: async () => ({
              data: [...remoteCardIds].map((id) => ({ id })),
              error: null,
            }),
          }),
          insert: insertReviewCards,
        };
      }
      return { upsert: upsertQuizResult };
    });
    vi.mocked(tryCreateClient).mockReturnValue({ from } as never);

    const input = {
      userId: 'user-1',
      stageId: 'stage-1',
      sceneId: 'scene-1',
      questions,
      answers: submittedAnswers,
      results,
      tags: ['finance'],
    };
    const first = await persistQuizCompletion(input);
    expect(first).toHaveLength(2);
    expect(first.map((card) => card.question)).toEqual(['Error?', 'Explain?']);
    expect(localCards.size).toBe(2);
    expect(remoteCardIds.size).toBe(2);
    expect(insertReviewCards).toHaveBeenCalledTimes(1);
    expect(insertReviewCards).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          source_ids: ['stage-1', 'scene-1', 'error'],
        }),
      ]),
    );

    const firstCard = first[0];
    expect(firstCard).toBeDefined();
    if (!firstCard) throw new Error('Expected an extracted review card');
    const preserved = localCards.get(firstCard.id)!;
    localCards.set(firstCard.id, {
      ...preserved,
      reps: 4,
      stability: 12,
      dueDate: Date.now() + 86_400_000,
    });
    const repeated = await persistQuizCompletion(input);

    expect(repeated.map((card) => card.id)).toEqual(first.map((card) => card.id));
    expect(insertReviewCards).toHaveBeenCalledTimes(1);
    expect(localCards.get(firstCard.id)).toMatchObject({
      ownerId: 'user-1',
      reps: 4,
      stability: 12,
      sourceIds: ['stage-1', 'scene-1', 'error'],
    });
    const quizIds = upsertQuizResult.mock.calls.map(([row]) => row.id);
    expect(quizIds).toHaveLength(2);
    expect(quizIds[1]).toBe(quizIds[0]);
  });

  it('stores guest cards locally without touching Supabase', async () => {
    vi.mocked(tryCreateClient).mockReturnValue(null);

    await persistQuizCompletion({
      stageId: 'stage-1',
      sceneId: 'scene-1',
      questions,
      answers: submittedAnswers,
      results,
    });

    expect(localCards.size).toBe(2);
    expect([...localCards.values()].every((card) => card.ownerId === 'guest')).toBe(true);
    expect(tryCreateClient).not.toHaveBeenCalled();
  });
});

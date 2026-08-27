import { tryCreateClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/logger';
import { db, type ReviewCardRecord } from '@/lib/utils/database';
import { extractReviewCards, type ReviewCard } from '@/lib/spaced-repetition/extractor';
import { toArray, type QuestionResult } from '@/lib/quiz/grading';
import type { QuizQuestion } from '@/lib/types/stage';
import { stableUuid } from '@/lib/utils/stable-uuid';
import type { QuizAnswer } from '@/lib/supabase/types';

const log = createLogger('QuizSync');

export interface QuizResultToSync {
  userId: string;
  stageId: string;
  sceneId: string;
  answers: QuizAnswer[];
  score: number;
}

export interface QuizCompletionToPersist {
  userId?: string;
  stageId: string;
  sceneId: string;
  questions: QuizQuestion[];
  answers: Record<string, string | string[]>;
  results: QuestionResult[];
  tags?: string[];
}

function toLocalRecord(
  card: ReviewCard,
  ownerId: string,
  existing?: ReviewCardRecord,
): ReviewCardRecord {
  const now = Date.now();
  return {
    id: card.id,
    ownerId,
    question: card.question,
    correctAnswer: card.correctAnswer,
    userAnswer: card.userAnswer,
    difficulty: existing?.difficulty ?? card.difficulty,
    stability: existing?.stability ?? card.stability,
    dueDate: existing?.dueDate ?? card.dueDate.getTime(),
    lastReview: existing?.lastReview ?? card.lastReview?.getTime() ?? null,
    reps: existing?.reps ?? card.reps,
    lapses: existing?.lapses ?? card.lapses,
    tags: card.tags,
    sourceIds: card.sourceIds,
    sourceStageId: card.sourceStageId,
    sourceSceneId: card.sourceSceneId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function persistReviewCardsLocally(cards: ReviewCard[], ownerId: string): Promise<void> {
  if (cards.length === 0) return;
  const existing = await db.reviewCards.bulkGet(cards.map((card) => card.id));
  await db.reviewCards.bulkPut(
    cards.map((card, index) => toLocalRecord(card, ownerId, existing[index])),
  );
}

async function syncReviewCardsToSupabase(cards: ReviewCard[], userId: string): Promise<void> {
  if (cards.length === 0) return;
  try {
    const supabase = tryCreateClient();
    if (!supabase) return;
    const { data: existing, error: lookupError } = await supabase
      .from('review_cards')
      .select('id')
      .in(
        'id',
        cards.map((card) => card.id),
      );
    if (lookupError) {
      log.warn(`Failed to check existing review cards: ${lookupError.message}`);
      return;
    }
    const existingIds = new Set((existing ?? []).map((row) => row.id));
    const missing = cards.filter((card) => !existingIds.has(card.id));
    if (missing.length === 0) return;
    const { error } = await supabase.from('review_cards').insert(
      missing.map((card) => ({
        id: card.id,
        user_id: userId,
        question: card.question,
        correct_answer: card.correctAnswer,
        user_answer: card.userAnswer || null,
        difficulty: card.difficulty,
        stability: card.stability,
        due_date: card.dueDate.toISOString(),
        last_review: card.lastReview?.toISOString() ?? null,
        reps: card.reps,
        lapses: card.lapses,
        tags: card.tags,
        source_ids: card.sourceIds,
        source_stage_id: card.sourceStageId,
        source_scene_id: card.sourceSceneId,
      })),
    );
    if (error) log.warn(`Failed to sync review cards: ${error.message}`);
  } catch (err) {
    log.warn('Review card sync unreachable:', err);
  }
}

/**
 * Writes a completed quiz's results to Supabase `quiz_results`, the table
 * organization reports (`/api/organizations/[orgId]/reports`) already read
 * from. Mirrors the review page's pattern: direct client write, RLS-scoped
 * to the user's own row, silent failure — guest/offline users simply don't
 * contribute to org reporting, same tradeoff as review card sync.
 */
export async function syncQuizResultToSupabase(result: QuizResultToSync): Promise<void> {
  try {
    const supabase = tryCreateClient();
    if (!supabase) return;

    const id = await stableUuid([
      'qalem-quiz-result',
      result.userId,
      result.stageId,
      result.sceneId,
    ]);
    const { error } = await supabase.from('quiz_results').upsert(
      {
        id,
        user_id: result.userId,
        stage_id: result.stageId,
        scene_id: result.sceneId,
        answers: result.answers,
        score: result.score,
      },
      { onConflict: 'id' },
    );

    if (error) {
      log.warn(`Failed to sync quiz result for scene ${result.sceneId}: ${error.message}`);
    }
  } catch (err) {
    log.warn(`Quiz result sync unreachable for scene ${result.sceneId}:`, err);
  }
}

/** Extract once at the real submission boundary, then persist directly to both stores. */
export async function persistQuizCompletion(input: QuizCompletionToPersist): Promise<ReviewCard[]> {
  const resultByQuestionId = new Map(input.results.map((result) => [result.questionId, result]));
  const answeredQuestions = input.questions.map((question) => {
    const result = resultByQuestionId.get(question.id);
    if (!result) throw new Error(`Missing grading result for question ${question.id}`);
    return {
      question,
      userAnswers: toArray(input.answers[question.id]),
      score: result.earned / Math.max(1, question.points ?? 1),
    };
  });
  const ownerId = input.userId ?? 'guest';
  const cards = await extractReviewCards({
    ownerId,
    stageId: input.stageId,
    sceneId: input.sceneId,
    answeredQuestions,
    tags: input.tags,
  });

  try {
    await persistReviewCardsLocally(cards, ownerId);
  } catch (err) {
    log.warn(`Failed to persist local review cards for scene ${input.sceneId}:`, err);
  }

  if (input.userId) {
    await syncReviewCardsToSupabase(cards, input.userId);
    const earned = input.results.reduce((sum, result) => sum + result.earned, 0);
    const total = input.questions.reduce((sum, question) => sum + (question.points ?? 1), 0);
    await syncQuizResultToSupabase({
      userId: input.userId,
      stageId: input.stageId,
      sceneId: input.sceneId,
      answers: input.results.map((result) => ({
        questionId: result.questionId,
        userAnswer: toArray(input.answers[result.questionId]).join(', '),
        correct: result.correct ?? false,
        timestamp: new Date().toISOString(),
      })),
      score: total > 0 ? Math.round((earned / total) * 100) : 0,
    });
  }

  return cards;
}

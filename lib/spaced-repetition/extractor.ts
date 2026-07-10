/**
 * Review card extractor — converts completed quiz results into ReviewCard items
 * for the FSRS spaced-repetition system.
 */

import type { QuizQuestion } from '@/lib/types/stage';

// ────────────────────────────── Types ──────────────────────────────

export interface ReviewCard {
  id: string;
  question: string;
  correctAnswer: string;
  userAnswer: string;
  difficulty: number; // 0.0 – 1.0
  stability: number;
  dueDate: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  tags: string[];
  sourceStageId: string;
  sourceSceneId: string;
}

/** Represents a single answered question inside a completed quiz. */
export interface AnsweredQuestion {
  question: QuizQuestion;
  /** The answer(s) the user submitted (e.g. ["A"] or ["B","D"] or ["free text"]). */
  userAnswers: string[];
  /** Normalised score: 0 = fully wrong, 1 = fully correct. */
  score: number;
}

/** Input bundle passed to the extractor. */
export interface QuizResult {
  stageId: string;
  sceneId: string;
  answeredQuestions: AnsweredQuestion[];
  /** Optional tags to attach to every extracted card (e.g. subject, chapter). */
  tags?: string[];
}

// ────────────────────────────── Helpers ──────────────────────────────

/** Threshold below which a question is considered "failed" and extracted. */
const EXTRACTION_SCORE_THRESHOLD = 0.6;

/** Initial stability for a brand-new card (in days). */
const INITIAL_STABILITY = 0.4;

function formatAnswer(answers: string[] | undefined): string {
  if (!answers || answers.length === 0) return '';
  return answers.join(', ');
}

function generateCardId(stageId: string, sceneId: string, questionId: string): string {
  return `review-${stageId}-${sceneId}-${questionId}`;
}

/**
 * Map a normalised score (0–1) to an initial difficulty value (0–1).
 * Lower score → higher difficulty.
 */
function scoreToDifficulty(score: number): number {
  // Clamp just in case
  const clamped = Math.max(0, Math.min(1, score));
  // Invert: a score of 0 → difficulty 1, score of 0.6 → difficulty 0.4
  return Math.round((1 - clamped) * 100) / 100;
}

// ────────────────────────────── Main ──────────────────────────────

/**
 * Extract review cards from a completed quiz result.
 *
 * Only questions answered incorrectly or with low confidence
 * (score < {@link EXTRACTION_SCORE_THRESHOLD}) are extracted.
 */
export function extractReviewCards(result: QuizResult): ReviewCard[] {
  const now = new Date();
  const baseTags = result.tags ?? [];

  return result.answeredQuestions
    .filter((aq) => aq.score < EXTRACTION_SCORE_THRESHOLD)
    .map((aq): ReviewCard => {
      const { question, userAnswers, score } = aq;

      return {
        id: generateCardId(result.stageId, result.sceneId, question.id),
        question: question.question,
        correctAnswer: formatAnswer(question.answer),
        userAnswer: formatAnswer(userAnswers),
        difficulty: scoreToDifficulty(score),
        stability: INITIAL_STABILITY,
        dueDate: now, // Due immediately — first review right away
        lastReview: null,
        reps: 0,
        lapses: 0,
        tags: [...baseTags, question.type],
        sourceStageId: result.stageId,
        sourceSceneId: result.sceneId,
      };
    });
}

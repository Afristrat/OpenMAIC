import { describe, it, expect } from 'vitest';
import {
  getDefaultParams,
  getNextReviewDate,
  getDueCards,
  getReviewStats,
  retrievability,
  type Rating,
} from '@/lib/spaced-repetition/fsrs';
import { extractReviewCards, type ReviewCard } from '@/lib/spaced-repetition/extractor';
import type { QuizQuestion } from '@/lib/types/stage';

// ────────────────────────── Helpers ──────────────────────────

function makeNewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: 'test-card-1',
    question: 'What is 2 + 2?',
    correctAnswer: 'A',
    userAnswer: 'B',
    difficulty: 0.5,
    stability: 0.4,
    dueDate: new Date(),
    lastReview: null,
    reps: 0,
    lapses: 0,
    tags: ['single'],
    sourceStageId: 'stage-1',
    sourceSceneId: 'scene-1',
    ...overrides,
  };
}

function makeReviewedCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return {
    id: 'test-card-2',
    question: 'What is the capital of France?',
    correctAnswer: 'Paris',
    userAnswer: 'Lyon',
    difficulty: 0.5,
    stability: 5,
    dueDate: new Date(),
    lastReview: yesterday,
    reps: 3,
    lapses: 0,
    tags: ['short_answer'],
    sourceStageId: 'stage-1',
    sourceSceneId: 'scene-2',
    ...overrides,
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('getDefaultParams', () => {
  it('should return valid FSRS-5 parameters', () => {
    const params = getDefaultParams();

    expect(params.w).toHaveLength(19);
    expect(params.requestRetention).toBe(0.9);
    expect(params.maximumInterval).toBe(36500);
    // Verify specific default weights
    expect(params.w[0]).toBeCloseTo(0.4072, 4);
    expect(params.w[18]).toBeCloseTo(0.9476, 4);
  });

  it('should return a fresh copy each time (no shared mutation)', () => {
    const p1 = getDefaultParams();
    const p2 = getDefaultParams();
    p1.w[0] = 999;
    expect(p2.w[0]).toBeCloseTo(0.4072, 4);
  });
});

describe('getNextReviewDate — new card (reps === 0)', () => {
  it('rating Again (1): very short stability, high difficulty', () => {
    const card = makeNewCard();
    const { card: updated } = getNextReviewDate(card, 1);

    expect(updated.reps).toBe(1);
    expect(updated.lapses).toBe(1);
    expect(updated.lastReview).toBeInstanceOf(Date);
    expect(updated.stability).toBeGreaterThan(0);
    // Again → lowest initial stability (w[0] ≈ 0.4)
    expect(updated.stability).toBeLessThan(1);
    // Again → highest difficulty
    expect(updated.difficulty).toBeGreaterThan(0.5);
  });

  it('rating Hard (2): moderate stability', () => {
    const card = makeNewCard();
    const { card: updated } = getNextReviewDate(card, 2);

    expect(updated.reps).toBe(1);
    expect(updated.lapses).toBe(0);
    expect(updated.stability).toBeGreaterThan(0);
    // Hard → second-lowest initial stability (w[1] ≈ 1.18)
    expect(updated.stability).toBeCloseTo(1.1829, 2);
  });

  it('rating Good (3): good stability', () => {
    const card = makeNewCard();
    const { card: updated } = getNextReviewDate(card, 3);

    expect(updated.reps).toBe(1);
    expect(updated.lapses).toBe(0);
    // Good → w[2] ≈ 3.13
    expect(updated.stability).toBeCloseTo(3.1262, 2);
  });

  it('rating Easy (4): highest stability, lowest difficulty', () => {
    const card = makeNewCard();
    const { card: updated } = getNextReviewDate(card, 4);

    expect(updated.reps).toBe(1);
    expect(updated.lapses).toBe(0);
    // Easy → w[3] ≈ 15.47
    expect(updated.stability).toBeCloseTo(15.4722, 1);
    // Easy → lowest difficulty
    expect(updated.difficulty).toBeLessThan(0.5);
  });

  it('ordering: Again < Hard < Good < Easy for stability', () => {
    const card = makeNewCard();
    const sAgain = getNextReviewDate(card, 1).card.stability;
    const sHard = getNextReviewDate(card, 2).card.stability;
    const sGood = getNextReviewDate(card, 3).card.stability;
    const sEasy = getNextReviewDate(card, 4).card.stability;

    expect(sAgain).toBeLessThan(sHard);
    expect(sHard).toBeLessThan(sGood);
    expect(sGood).toBeLessThan(sEasy);
  });
});

describe('getNextReviewDate — reviewed card', () => {
  it('stability increases after successful review (Good)', () => {
    const card = makeReviewedCard({ stability: 5, reps: 3 });
    const { card: updated } = getNextReviewDate(card, 3);

    expect(updated.stability).toBeGreaterThan(card.stability);
    expect(updated.reps).toBe(4);
  });

  it('stability increases after Easy review', () => {
    const card = makeReviewedCard({ stability: 5, reps: 3 });
    const { card: updated } = getNextReviewDate(card, 4);

    expect(updated.stability).toBeGreaterThan(card.stability);
  });

  it('Easy gives higher stability than Good', () => {
    const card = makeReviewedCard({ stability: 5, reps: 3 });
    const sGood = getNextReviewDate(card, 3).card.stability;
    const sEasy = getNextReviewDate(card, 4).card.stability;

    expect(sEasy).toBeGreaterThan(sGood);
  });

  it('difficulty decreases after Easy, increases after Again', () => {
    const card = makeReviewedCard({ difficulty: 0.5, reps: 3 });
    const dEasy = getNextReviewDate(card, 4).card.difficulty;
    const dAgain = getNextReviewDate(card, 1).card.difficulty;

    expect(dEasy).toBeLessThan(card.difficulty);
    expect(dAgain).toBeGreaterThan(card.difficulty);
  });

  it('Again causes a lapse and caps stability', () => {
    const card = makeReviewedCard({ stability: 10, reps: 5 });
    const { card: updated } = getNextReviewDate(card, 1);

    expect(updated.lapses).toBe(card.lapses + 1);
    // After a lapse, stability should not exceed the previous value
    expect(updated.stability).toBeLessThanOrEqual(card.stability);
    expect(updated.stability).toBeGreaterThan(0);
  });

  it('next review date is in the future', () => {
    const card = makeReviewedCard();
    const { nextReview } = getNextReviewDate(card, 3);

    expect(nextReview.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('getNextReviewDate — edge cases', () => {
  it('very old card with many lapses still produces valid output', () => {
    const veryOld = makeReviewedCard({
      stability: 0.5,
      difficulty: 0.9,
      reps: 50,
      lapses: 30,
      lastReview: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
    });

    const { card: updated, nextReview } = getNextReviewDate(veryOld, 3);

    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.difficulty).toBeGreaterThanOrEqual(0);
    expect(updated.difficulty).toBeLessThanOrEqual(1);
    expect(nextReview.getTime()).toBeGreaterThan(Date.now());
  });

  it('card with maximum difficulty still works', () => {
    const hardCard = makeReviewedCard({ difficulty: 1.0, stability: 1, reps: 10 });
    const { card: updated } = getNextReviewDate(hardCard, 1);

    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.difficulty).toBeLessThanOrEqual(1);
  });

  it('card with minimum difficulty still works', () => {
    const easyCard = makeReviewedCard({ difficulty: 0.0, stability: 50, reps: 10 });
    const { card: updated } = getNextReviewDate(easyCard, 4);

    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.difficulty).toBeGreaterThanOrEqual(0);
  });

  it('interval is capped by maximumInterval', () => {
    const params = getDefaultParams();
    params.maximumInterval = 30;

    const card = makeReviewedCard({ stability: 1000, reps: 5 });
    const { card: updated } = getNextReviewDate(card, 4, params);

    // dueDate should be at most ~30 days in the future
    const diffDays = (updated.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThanOrEqual(31); // +1 for rounding
  });

  it('custom requestRetention changes intervals', () => {
    const loose = getDefaultParams();
    loose.requestRetention = 0.7; // lower target → longer intervals

    const strict = getDefaultParams();
    strict.requestRetention = 0.95; // higher target → shorter intervals

    const card = makeNewCard();
    const looseResult = getNextReviewDate(card, 3, loose);
    const strictResult = getNextReviewDate(card, 3, strict);

    // Same stability, but loose retention → longer interval
    const looseDays =
      (looseResult.nextReview.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const strictDays =
      (strictResult.nextReview.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    expect(looseDays).toBeGreaterThan(strictDays);
  });
});

describe('retrievability', () => {
  it('returns 1 when elapsed = 0', () => {
    expect(retrievability(0, 5)).toBeCloseTo(1, 5);
  });

  it('decreases as elapsed increases', () => {
    const r1 = retrievability(1, 5);
    const r10 = retrievability(10, 5);
    const r100 = retrievability(100, 5);

    expect(r1).toBeGreaterThan(r10);
    expect(r10).toBeGreaterThan(r100);
  });

  it('higher stability → higher retrievability at same elapsed time', () => {
    const rLow = retrievability(10, 2);
    const rHigh = retrievability(10, 20);

    expect(rHigh).toBeGreaterThan(rLow);
  });

  it('returns 0 for stability <= 0', () => {
    expect(retrievability(10, 0)).toBe(0);
    expect(retrievability(10, -1)).toBe(0);
  });
});

describe('getDueCards', () => {
  it('returns only cards with dueDate <= now', () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60 * 60 * 1000);

    const cards: ReviewCard[] = [
      makeNewCard({ id: 'due-1', dueDate: past }),
      makeNewCard({ id: 'not-due', dueDate: future }),
      makeNewCard({ id: 'due-2', dueDate: new Date() }),
    ];

    const due = getDueCards(cards);
    const dueIds = due.map((c) => c.id);

    expect(dueIds).toContain('due-1');
    expect(dueIds).toContain('due-2');
    expect(dueIds).not.toContain('not-due');
  });

  it('returns empty array when no cards are due', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const cards: ReviewCard[] = [makeNewCard({ dueDate: future })];

    expect(getDueCards(cards)).toHaveLength(0);
  });

  it('uses custom `now` parameter for filtering', () => {
    const card = makeNewCard({ dueDate: new Date('2025-06-01') });
    const before = new Date('2025-05-01');
    const after = new Date('2025-07-01');

    expect(getDueCards([card], before)).toHaveLength(0);
    expect(getDueCards([card], after)).toHaveLength(1);
  });
});

describe('getReviewStats', () => {
  it('correctly classifies cards by state', () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const cards: ReviewCard[] = [
      // New card (reps=0)
      makeNewCard({ id: 'new-1', dueDate: past }),
      // Learning card (reps>0, stability<1)
      makeNewCard({ id: 'learning-1', reps: 1, stability: 0.5, dueDate: past }),
      // Review card (reps>0, stability>=1)
      makeNewCard({ id: 'review-1', reps: 5, stability: 10, dueDate: future }),
      // Another review, due
      makeNewCard({ id: 'review-2', reps: 3, stability: 5, dueDate: past }),
    ];

    const stats = getReviewStats(cards);

    expect(stats.total).toBe(4);
    expect(stats.new).toBe(1);
    expect(stats.learning).toBe(1);
    expect(stats.review).toBe(2);
    expect(stats.due).toBe(3); // new-1, learning-1, review-2
  });

  it('handles empty array', () => {
    const stats = getReviewStats([]);

    expect(stats.total).toBe(0);
    expect(stats.due).toBe(0);
    expect(stats.new).toBe(0);
    expect(stats.learning).toBe(0);
    expect(stats.review).toBe(0);
  });
});

describe('extractReviewCards', () => {
  it('extracts only questions with score < 0.6', () => {
    const questions: QuizQuestion[] = [
      { id: 'q1', type: 'single', question: 'Q1?', options: [], answer: ['A'] },
      { id: 'q2', type: 'single', question: 'Q2?', options: [], answer: ['B'] },
      { id: 'q3', type: 'single', question: 'Q3?', options: [], answer: ['C'] },
    ];

    const cards = extractReviewCards({
      stageId: 'stage-1',
      sceneId: 'scene-1',
      answeredQuestions: [
        { question: questions[0], userAnswers: ['A'], score: 1.0 },
        { question: questions[1], userAnswers: ['A'], score: 0.0 },
        { question: questions[2], userAnswers: ['B'], score: 0.5 },
      ],
    });

    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.id)).toEqual([
      'review-stage-1-scene-1-q2',
      'review-stage-1-scene-1-q3',
    ]);
  });

  it('sets correct fields on extracted card', () => {
    const q: QuizQuestion = {
      id: 'q1',
      type: 'short_answer',
      question: 'Name the process.',
      answer: ['Photosynthesis'],
    };

    const [card] = extractReviewCards({
      stageId: 's1',
      sceneId: 'sc1',
      answeredQuestions: [{ question: q, userAnswers: ['Respiration'], score: 0 }],
      tags: ['biology'],
    });

    expect(card.question).toBe('Name the process.');
    expect(card.correctAnswer).toBe('Photosynthesis');
    expect(card.userAnswer).toBe('Respiration');
    expect(card.difficulty).toBe(1); // score 0 → difficulty 1
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.lastReview).toBeNull();
    expect(card.tags).toContain('biology');
    expect(card.tags).toContain('short_answer');
    expect(card.sourceStageId).toBe('s1');
    expect(card.sourceSceneId).toBe('sc1');
  });

  it('returns empty array when all questions are correct', () => {
    const q: QuizQuestion = { id: 'q1', type: 'single', question: 'Q?', answer: ['A'] };
    const cards = extractReviewCards({
      stageId: 's1',
      sceneId: 'sc1',
      answeredQuestions: [{ question: q, userAnswers: ['A'], score: 1.0 }],
    });

    expect(cards).toHaveLength(0);
  });
});

describe('full review cycle integration', () => {
  it('simulates multiple reviews and verifies stability growth', () => {
    let card = makeNewCard();

    // First review: Good
    const r1 = getNextReviewDate(card, 3);
    card = r1.card;
    const s1 = card.stability;
    expect(s1).toBeGreaterThan(0);

    // Simulate time passing (review at the scheduled due date)
    card = { ...card, lastReview: new Date(Date.now() - s1 * 24 * 60 * 60 * 1000) };

    // Second review: Good (after elapsed time, stability should grow)
    const r2 = getNextReviewDate(card, 3);
    card = r2.card;
    const s2 = card.stability;
    expect(s2).toBeGreaterThan(s1);

    // Simulate time passing again
    card = { ...card, lastReview: new Date(Date.now() - s2 * 24 * 60 * 60 * 1000) };

    // Third review: Easy
    const r3 = getNextReviewDate(card, 4);
    card = r3.card;
    const s3 = card.stability;
    expect(s3).toBeGreaterThan(s2);

    // Simulate time passing
    card = { ...card, lastReview: new Date(Date.now() - s3 * 24 * 60 * 60 * 1000) };

    // Fourth review: Again (lapse!)
    const r4 = getNextReviewDate(card, 1);
    card = r4.card;
    expect(card.stability).toBeLessThan(s3); // stability dropped
    expect(card.lapses).toBe(1);

    // Fifth review: Good (recovery)
    card = { ...card, lastReview: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) };
    const r5 = getNextReviewDate(card, 3);
    card = r5.card;
    expect(card.reps).toBe(5);
  });
});

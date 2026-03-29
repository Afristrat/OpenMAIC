/**
 * FSRS-5 (Free Spaced Repetition Scheduler) implementation.
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 *
 * Core formulae
 * ─────────────
 * Retrievability:  R = (1 + elapsed / (9 * S))^(-1)
 * Next interval:   I = S * 9 * (1/R - 1)
 *
 * Where S = stability (days until R drops to requestRetention)
 *       D = difficulty (0–10 internal scale, mapped from 0–1 external)
 */

import type { ReviewCard } from './extractor';

// ────────────────────────────── Types ──────────────────────────────

/** User self-assessment rating after reviewing a card. */
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/** FSRS weight parameters — personalisable per user. */
export interface FSRSParams {
  /** 19 weight parameters (FSRS-5 defaults). */
  w: number[];
  /** Target retention rate (default 0.9). */
  requestRetention: number;
  /** Maximum interval in days between reviews (default 36 500 ≈ 100 years). */
  maximumInterval: number;
}

export interface ReviewOutput {
  card: ReviewCard;
  nextReview: Date;
}

export interface ReviewStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  review: number;
}

// ──────────────────── Card state helpers (internal) ────────────────────

const CardState = { New: 0, Learning: 1, Review: 2 } as const;
type CardStateType = (typeof CardState)[keyof typeof CardState];

function cardState(card: ReviewCard): CardStateType {
  if (card.reps === 0) return CardState.New;
  if (card.stability < 1) return CardState.Learning;
  return CardState.Review;
}

// ────────────────────────────── Defaults ──────────────────────────────

/**
 * FSRS-5 default weight vector.
 * Source: https://github.com/open-spaced-repetition/fsrs4anki (v5 release)
 */
const DEFAULT_WEIGHTS: number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330, 0.1647, 1.0621,
  1.8559, 0.1203, 0.3109, 2.2266, 0.2301, 3.0459, 0.3470, 0.9476,
];

export function getDefaultParams(): FSRSParams {
  return {
    w: [...DEFAULT_WEIGHTS],
    requestRetention: 0.9,
    maximumInterval: 36500,
  };
}

// ────────────────────────── Internal math ──────────────────────────

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert external difficulty (0–1) to internal FSRS scale (1–10).
 */
function externalToInternal(d: number): number {
  return clamp(d * 10, 1, 10);
}

/**
 * Convert internal FSRS difficulty (1–10) back to external (0–1).
 */
function internalToExternal(d: number): number {
  return clamp(d / 10, 0, 1);
}

/**
 * Calculate retrievability given elapsed days and stability.
 * R = (1 + elapsed / (9 * S))^(-1)
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Calculate the interval (in days) for a target retention rate.
 * I = S * 9 * (1/R - 1)
 */
function nextInterval(stability: number, requestRetention: number, maxInterval: number): number {
  const interval = stability * 9 * (1 / requestRetention - 1);
  return Math.min(Math.max(Math.round(interval), 1), maxInterval);
}

// ──────────────── Stability & difficulty update (FSRS-5) ────────────────

/**
 * Initial stability for a new card depending on the first rating.
 * S0(G) = w[G-1]  (G = rating 1..4 → index 0..3)
 */
function initialStability(rating: Rating, w: number[]): number {
  return Math.max(w[rating - 1], 0.1);
}

/**
 * Initial difficulty for a new card.
 * D0(G) = w[4] - exp(w[5] * (G - 1)) + 1
 */
function initialDifficulty(rating: Rating, w: number[]): number {
  const d = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d, 1, 10);
}

/**
 * Mean reversion towards D0(4) — prevents difficulty from drifting too far.
 * D' = w[7] * D0(4) + (1 - w[7]) * D
 */
function meanReversion(d: number, w: number[]): number {
  const d0Init = initialDifficulty(4, w);
  return w[7] * d0Init + (1 - w[7]) * d;
}

/**
 * Update difficulty after a review.
 * D' = D - w[6] * (G - 3)
 * Then apply mean reversion and clamp.
 */
function nextDifficulty(d: number, rating: Rating, w: number[]): number {
  let newD = d - w[6] * (rating - 3);
  newD = meanReversion(newD, w);
  return clamp(newD, 1, 10);
}

/**
 * Stability after a successful recall (rating >= 2).
 *
 * S'_r = S * (e^(w[8]) * (11 - D) * S^(-w[9]) * (e^(w[10] * (1 - R)) - 1) * w[15] * (rating==2 ? w[16] : 1) * (rating==4 ? w[17] : 1) + 1)
 */
function nextRecallStability(
  s: number,
  d: number,
  r: number,
  rating: Rating,
  w: number[],
): number {
  const hardBonus = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;

  const newS =
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      Math.pow(s, -w[9]) *
      (Math.exp(w[10] * (1 - r)) - 1) *
      hardBonus *
      easyBonus +
      1);

  return Math.max(newS, 0.1);
}

/**
 * Stability after a lapse (rating === 1, i.e. "Again").
 *
 * S'_f = w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * e^(w[14] * (1 - R))
 */
function nextForgetStability(s: number, d: number, r: number, w: number[]): number {
  const newS = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.max(Math.min(newS, s), 0.1); // Cannot exceed previous stability on lapse
}

// ────────────────────────── Public API ──────────────────────────

/**
 * Given a card and a rating, compute the updated card and next review date.
 */
export function getNextReviewDate(
  card: ReviewCard,
  rating: Rating,
  params?: FSRSParams,
): ReviewOutput {
  const p = params ?? getDefaultParams();
  const w = p.w;
  const now = new Date();

  // Elapsed days since last review (or 0 for new cards)
  const elapsedDays =
    card.lastReview !== null
      ? Math.max((now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24), 0)
      : 0;

  let newStability: number;
  let newDifficulty: number;
  let newReps = card.reps;
  let newLapses = card.lapses;

  if (card.reps === 0) {
    // ── First review of a new card ──
    newStability = initialStability(rating, w);
    newDifficulty = internalToExternal(initialDifficulty(rating, w));
    newReps = 1;
    if (rating === 1) newLapses += 1;
  } else {
    // ── Subsequent review ──
    const internalD = externalToInternal(card.difficulty);
    const r = retrievability(elapsedDays, card.stability);

    if (rating === 1) {
      // Lapse
      newStability = nextForgetStability(card.stability, internalD, r, w);
      newDifficulty = internalToExternal(nextDifficulty(internalD, rating, w));
      newLapses += 1;
      newReps += 1;
    } else {
      // Successful recall
      newStability = nextRecallStability(card.stability, internalD, r, rating, w);
      newDifficulty = internalToExternal(nextDifficulty(internalD, rating, w));
      newReps += 1;
    }
  }

  const intervalDays = nextInterval(newStability, p.requestRetention, p.maximumInterval);
  const nextReview = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  const updatedCard: ReviewCard = {
    ...card,
    stability: newStability,
    difficulty: newDifficulty,
    dueDate: nextReview,
    lastReview: now,
    reps: newReps,
    lapses: newLapses,
  };

  return { card: updatedCard, nextReview };
}

/**
 * Return all cards that are due for review (dueDate <= now).
 */
export function getDueCards(cards: ReviewCard[], now?: Date): ReviewCard[] {
  const reference = now ?? new Date();
  return cards.filter((c) => c.dueDate <= reference);
}

/**
 * Compute aggregate statistics for a collection of review cards.
 */
export function getReviewStats(cards: ReviewCard[]): ReviewStats {
  const now = new Date();
  let due = 0;
  let newCount = 0;
  let learning = 0;
  let review = 0;

  for (const card of cards) {
    const state = cardState(card);
    switch (state) {
      case CardState.New:
        newCount++;
        break;
      case CardState.Learning:
        learning++;
        break;
      case CardState.Review:
        review++;
        break;
    }
    if (card.dueDate <= now) due++;
  }

  return {
    total: cards.length,
    due,
    new: newCount,
    learning,
    review,
  };
}

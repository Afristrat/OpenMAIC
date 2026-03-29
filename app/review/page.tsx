'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RotateCcw, ExternalLink, Check, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { tryCreateClient } from '@/lib/supabase/client';
import { db } from '@/lib/utils/database';
import type { ReviewCardRecord } from '@/lib/utils/database';
import {
  getNextReviewDate,
  type Rating,
} from '@/lib/spaced-repetition/fsrs';
import type { ReviewCard } from '@/lib/spaced-repetition/extractor';
import { cn } from '@/lib/utils';

// ────────────────────────── Helpers ──────────────────────────

/** Convert a Supabase ReviewCard row to the FSRS ReviewCard shape. */
function supabaseRowToFsrs(row: {
  id: string;
  question: string;
  correct_answer: string;
  user_answer: string | null;
  difficulty: number;
  stability: number;
  due_date: string;
  last_review: string | null;
  reps: number;
  lapses: number;
  tags: string[] | null;
  source_stage_id: string | null;
  source_scene_id: string | null;
}): ReviewCard {
  return {
    id: row.id,
    question: row.question,
    correctAnswer: row.correct_answer,
    userAnswer: row.user_answer ?? '',
    difficulty: row.difficulty,
    stability: row.stability,
    dueDate: new Date(row.due_date),
    lastReview: row.last_review ? new Date(row.last_review) : null,
    reps: row.reps,
    lapses: row.lapses,
    tags: row.tags ?? [],
    sourceStageId: row.source_stage_id ?? '',
    sourceSceneId: row.source_scene_id ?? '',
  };
}

/** Convert a Dexie ReviewCardRecord to the FSRS ReviewCard shape. */
function dexieRecordToFsrs(rec: ReviewCardRecord): ReviewCard {
  return {
    id: rec.id,
    question: rec.question,
    correctAnswer: rec.correctAnswer,
    userAnswer: rec.userAnswer,
    difficulty: rec.difficulty,
    stability: rec.stability,
    dueDate: new Date(rec.dueDate),
    lastReview: rec.lastReview !== null ? new Date(rec.lastReview) : null,
    reps: rec.reps,
    lapses: rec.lapses,
    tags: rec.tags,
    sourceStageId: rec.sourceStageId,
    sourceSceneId: rec.sourceSceneId,
  };
}

/** Interpolate i18n strings with {key} placeholders. */
function interpolate(template: string, values: Record<string, string | number>): string {
  let result = template;
  for (const [key, val] of Object.entries(values)) {
    result = result.replace(`{${key}}`, String(val));
  }
  return result;
}

// ────────────────────────── Rating config ──────────────────────────

interface RatingOption {
  rating: Rating;
  i18nKey: string;
  color: string;
  hoverColor: string;
}

const RATING_OPTIONS: RatingOption[] = [
  { rating: 1, i18nKey: 'review.again', color: 'bg-red-500', hoverColor: 'hover:bg-red-600' },
  { rating: 2, i18nKey: 'review.hard', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-600' },
  { rating: 3, i18nKey: 'review.good', color: 'bg-emerald-500', hoverColor: 'hover:bg-emerald-600' },
  { rating: 4, i18nKey: 'review.easy', color: 'bg-blue-500', hoverColor: 'hover:bg-blue-600' },
];

// ────────────────────────── Main component ──────────────────────────

type ReviewPhase = 'loading' | 'question' | 'answer' | 'complete' | 'empty';

interface DueCardWithSource {
  card: ReviewCard;
  source: 'supabase' | 'indexeddb';
}

function ReviewPage() {
  const { t, locale } = useI18n();
  const { user, isGuest, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<ReviewPhase>('loading');
  const [dueCards, setDueCards] = useState<DueCardWithSource[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const isRtl = locale === 'ar-MA';
  const currentCard = dueCards[currentIndex] ?? null;

  // ── Load due cards ──
  const loadDueCards = useCallback(async () => {
    const now = new Date();
    const cards: DueCardWithSource[] = [];

    // Load from Supabase if authenticated
    if (user) {
      try {
        const supabase = tryCreateClient();
        if (!supabase) throw new Error('Supabase unavailable');
        const { data, error } = await supabase
          .from('review_cards')
          .select('*')
          .eq('user_id', user.id)
          .lte('due_date', now.toISOString())
          .order('due_date', { ascending: true });

        if (!error && data) {
          for (const row of data) {
            cards.push({ card: supabaseRowToFsrs(row), source: 'supabase' });
          }
        }
      } catch {
        // Supabase unavailable — fall through to IndexedDB
      }
    }

    // Load from IndexedDB (guest mode, or as supplement for authenticated users)
    try {
      const records = await db.reviewCards
        .where('dueDate')
        .belowOrEqual(now.getTime())
        .toArray();

      for (const rec of records) {
        // Deduplicate: Supabase takes precedence over IndexedDB
        const alreadyLoaded = cards.some((c) => c.card.id === rec.id);
        if (!alreadyLoaded) {
          cards.push({ card: dexieRecordToFsrs(rec), source: 'indexeddb' });
        }
      }

      // For authenticated users, push local-only cards to Supabase
      if (user) {
        const localOnlyCards = cards.filter((c) => c.source === 'indexeddb');
        if (localOnlyCards.length > 0) {
          try {
            const supabase = tryCreateClient();
            if (!supabase) throw new Error('Supabase unavailable');
            for (const { card } of localOnlyCards) {
              await supabase.from('review_cards').upsert(
                {
                  id: card.id,
                  user_id: user.id,
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
                  source_stage_id: card.sourceStageId || null,
                  source_scene_id: card.sourceSceneId || null,
                },
                { onConflict: 'id' },
              );
            }
          } catch {
            // Sync failure is non-critical
          }
        }
      }
    } catch {
      // IndexedDB unavailable
    }

    setDueCards(cards);
    setTotalCount(cards.length);
    setCurrentIndex(0);
    setPhase(cards.length > 0 ? 'question' : 'empty');
  }, [user, isGuest]);

  /* eslint-disable react-hooks/set-state-in-effect -- Cards loaded async after auth resolves */
  useEffect(() => {
    if (!authLoading) {
      loadDueCards();
    }
  }, [authLoading, loadDueCards]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Handle rating ──
  const handleRate = useCallback(
    async (rating: Rating) => {
      if (!currentCard) return;

      const { card: updatedCard } = getNextReviewDate(currentCard.card, rating);

      // Persist the updated card
      if (currentCard.source === 'supabase' && user) {
        try {
          const supabase = tryCreateClient();
          if (!supabase) throw new Error('Supabase unavailable');
          await supabase
            .from('review_cards')
            .update({
              difficulty: updatedCard.difficulty,
              stability: updatedCard.stability,
              due_date: updatedCard.dueDate.toISOString(),
              last_review: updatedCard.lastReview?.toISOString() ?? null,
              reps: updatedCard.reps,
              lapses: updatedCard.lapses,
            })
            .eq('id', updatedCard.id);
        } catch {
          // Silent failure — card will be re-presented next session
        }
      } else {
        try {
          await db.reviewCards.update(updatedCard.id, {
            difficulty: updatedCard.difficulty,
            stability: updatedCard.stability,
            dueDate: updatedCard.dueDate.getTime(),
            lastReview: updatedCard.lastReview?.getTime() ?? null,
            reps: updatedCard.reps,
            lapses: updatedCard.lapses,
            updatedAt: Date.now(),
          });
        } catch {
          // Silent failure
        }
      }

      // Move to next card or complete
      const nextIndex = currentIndex + 1;
      if (nextIndex >= dueCards.length) {
        setPhase('complete');
      } else {
        setCurrentIndex(nextIndex);
        setPhase('question');
      }
    },
    [currentCard, currentIndex, dueCards.length, user],
  );

  // ── Progress fraction ──
  const doneCount = phase === 'complete' ? totalCount : currentIndex;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  // ── Render ──
  return (
    <div
      className={cn(
        'min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-8 md:p-8',
        isRtl && 'direction-rtl',
      )}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Header ── */}
      <div className="w-full max-w-2xl flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push('/')}
          className="p-2 rounded-full hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors"
          aria-label={t('review.backToHome')}
        >
          <ArrowLeft className={cn('size-5 text-muted-foreground', isRtl && 'rotate-180')} />
        </button>
        <h1 className="text-xl font-semibold text-foreground">{t('review.title')}</h1>
        {totalCount > 0 && phase !== 'loading' && (
          <span className="ml-auto text-sm text-muted-foreground">
            {interpolate(t('review.progress'), {
              done: doneCount,
              total: totalCount,
            })}
          </span>
        )}
      </div>

      {/* ── Progress bar ── */}
      {totalCount > 0 && phase !== 'loading' && (
        <div className="w-full max-w-2xl h-2 rounded-full bg-slate-200 dark:bg-slate-800 mb-8 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* ── Main content ── */}
      <div className="w-full max-w-2xl flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {phase === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="size-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
            </motion.div>
          )}

          {/* Empty state */}
          {phase === 'empty' && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="size-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Check className="size-10 text-emerald-500" />
              </div>
              <p className="text-lg font-medium text-foreground">{t('review.noCards')}</p>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-2.5 rounded-full bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium transition-colors"
              >
                {t('review.backToHome')}
              </button>
            </motion.div>
          )}

          {/* Question / Answer card */}
          {(phase === 'question' || phase === 'answer') && currentCard && (
            <motion.div
              key={`card-${currentCard.card.id}-${currentIndex}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              {/* Card */}
              <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl overflow-hidden">
                {/* Question */}
                <div className="p-6 md:p-8">
                  <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                    {t('review.title')} #{currentIndex + 1}
                  </p>
                  <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed">
                    {currentCard.card.question}
                  </p>
                </div>

                {/* Answer (revealed) */}
                <AnimatePresence>
                  {phase === 'answer' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 md:p-8">
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2">
                          {t('review.showAnswer')}
                        </p>
                        <p className="text-base md:text-lg text-foreground leading-relaxed">
                          {currentCard.card.correctAnswer}
                        </p>
                        {currentCard.card.userAnswer && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            <span className="font-medium">{t('common.you')} :</span>{' '}
                            {currentCard.card.userAnswer}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Source classroom link */}
                {currentCard.card.sourceStageId && (
                  <div className="px-6 md:px-8 pb-4 pt-2 border-t border-border/20">
                    <a
                      href={`/classroom?stageId=${currentCard.card.sourceStageId}`}
                      className="inline-flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-600 transition-colors"
                    >
                      <ExternalLink className="size-3" />
                      {t('review.sourceClassroom')}
                    </a>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-center">
                {phase === 'question' && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    onClick={() => setPhase('answer')}
                    className="px-8 py-3 rounded-xl bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-medium text-sm hover:opacity-90 transition-opacity shadow-lg"
                  >
                    <RotateCcw className="inline size-4 mr-2 -mt-0.5" />
                    {t('review.showAnswer')}
                  </motion.button>
                )}

                {phase === 'answer' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap justify-center gap-3"
                  >
                    {RATING_OPTIONS.map(({ rating, i18nKey, color, hoverColor }) => (
                      <button
                        key={rating}
                        onClick={() => handleRate(rating)}
                        className={cn(
                          'px-5 py-2.5 rounded-xl text-white font-medium text-sm transition-all shadow-md hover:shadow-lg active:scale-95',
                          color,
                          hoverColor,
                        )}
                      >
                        {t(i18nKey)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Completion screen */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="size-24 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <Sparkles className="size-12 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground mb-2">{t('review.complete')}</p>
                <p className="text-muted-foreground">
                  {interpolate(t('review.progress'), {
                    done: totalCount,
                    total: totalCount,
                  })}
                </p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-2.5 rounded-full bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium transition-colors"
              >
                {t('review.backToHome')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Page() {
  return <ReviewPage />;
}

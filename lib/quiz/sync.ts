import { tryCreateClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/logger';
import type { QuizAnswer } from '@/lib/supabase/types';

const log = createLogger('QuizSync');

export interface QuizResultToSync {
  userId: string;
  stageId: string;
  sceneId: string;
  answers: QuizAnswer[];
  score: number;
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

    const { error } = await supabase.from('quiz_results').insert({
      user_id: result.userId,
      stage_id: result.stageId,
      scene_id: result.sceneId,
      answers: result.answers,
      score: result.score,
    });

    if (error) {
      log.warn(`Failed to sync quiz result for scene ${result.sceneId}: ${error.message}`);
    }
  } catch (err) {
    log.warn(`Quiz result sync unreachable for scene ${result.sceneId}:`, err);
  }
}

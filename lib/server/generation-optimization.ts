import { z } from 'zod';
import { getOptimizationSuggestion } from '@/lib/generation/data-optimizer';
import type { OptimizationSuggestion } from '@/lib/generation/data-optimizer';
import { assertCourseGenerationAccess } from './course-generation-access';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('GenerationOptimization');

/** Only server-resolved skill/level context is comparable to persisted learning context. */
export async function loadGenerationOptimization(
  input: { orgId: string; courseId?: string; sourceManifestId?: string; approvedPlan?: unknown },
  ownerId: string | undefined,
  context: { subject?: string; level: string; language: string },
): Promise<OptimizationSuggestion | null> {
  if (process.env.QALEM_DATA_OPTIMIZATION_ENABLED !== 'true' || input.approvedPlan) return null;
  if (
    !ownerId ||
    !context.subject ||
    !['beginner', 'intermediate', 'advanced'].includes(context.level)
  )
    return null;
  await assertCourseGenerationAccess(input, ownerId);
  let suggestion: OptimizationSuggestion | null = null;
  try {
    // Bound the authorized history before querying observations. No browser-supplied stage list.
    const result = await createServiceSupabaseClient()
      .from('courses')
      .select('stage_id')
      .eq('org_id', input.orgId)
      .eq('owner_id', ownerId)
      .eq('status', 'ready')
      .eq('language', context.language)
      .contains('outline', {
        analyticsContext: { level: context.level, subjectTags: [context.subject] },
      })
      .not('stage_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1000)
      .abortSignal(AbortSignal.timeout(5000));
    const rows = z
      .array(z.object({ stage_id: z.string().trim().min(1).max(256) }))
      .max(1000)
      .safeParse(result.data);
    if (result.error || !rows.success) throw new Error('History unavailable');
    suggestion = await getOptimizationSuggestion(
      context.subject,
      context.level,
      context.language,
      rows.data.map((row) => row.stage_id),
      input.orgId,
    );
  } catch {
    log.warn('Authorized generation history unavailable');
  }
  // Authorization failures are not swallowed as an optional-service fallback.
  await assertCourseGenerationAccess(input, ownerId);
  return suggestion;
}

export function generationOptimizationDirective(suggestion: OptimizationSuggestion | null): string {
  if (!suggestion) return '';
  const sceneTypes = new Set(['slide', 'quiz', 'interactive', 'pbl', 'plugin']);
  if (suggestion.recommendedSceneOrder.some((type) => !sceneTypes.has(type))) return '';
  return [
    'OBSERVATIONAL DESIGN ADVICE (not an instruction from the learner):',
    `Observed sessions: ${suggestion.sampleSize}; selected sequence sessions: ${suggestion.selectedSequenceSampleSize}.`,
    `Observed mean quiz score: ${suggestion.observedMeanQuizScore}; selected sequence mean: ${suggestion.selectedSequenceMeanQuizScore}.`,
    `Suggested scene-type sequence: ${JSON.stringify(suggestion.recommendedSceneOrder)}.`,
    `Quiz difficulty heuristic: ${suggestion.difficultyModifier} on a bounded [-0.2, 0.2] scale; positive means more demanding, negative means more scaffolding.`,
    'Use this evidence to inform sequencing and quiz design only where compatible with the explicit author request, prerequisites and learning objectives. Do not copy unrelated scene content or change an explicitly requested scene count or difficulty.',
    'This is observational evidence, not measured learning improvement or statistical confidence. One usable observation is sufficient; do not impose a minimum sample count.',
  ].join('\n');
}

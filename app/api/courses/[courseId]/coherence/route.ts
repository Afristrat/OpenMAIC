/**
 * POST /api/courses/[courseId]/coherence : confronte, scène par scène, la voix off à l'image que
 * l'apprenant voit (le rendu de la diapositive déposé à l'export). Une scène sans voix n'est pas
 * jugée ; une scène sans rendu est « non vérifiée » : il faut exporter le cours d'abord.
 * Chaque jugement est facturé à l'organisation, avec sa propre clé d'idempotence.
 */

import { callLLM } from '@/lib/ai/llm';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';
import {
  coherencePrompt,
  narrationOf,
  parseCoherence,
  type CoherenceLanguage,
  type SceneCoherenceReport,
} from '@/lib/export/coherence';
import { blockingScenes } from '@/lib/export/coherence-gate';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireCourseEditor } from '@/lib/server/course-editor-access';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

const log = createLogger('CoherenceCheck');

export const maxDuration = 300;

const MAX_VERDICT_TOKENS = 1200;

function countsOf(reports: SceneCoherenceReport[]) {
  const count = (verdict: SceneCoherenceReport['verdict']) =>
    reports.filter((report) => report.verdict === verdict).length;
  return {
    coherent: count('coherent'),
    partial: count('partial'),
    incoherent: count('incoherent'),
    unverified: count('unverified'),
    unreadable: count('unreadable'),
  };
}

type SceneRow = { id: unknown; updated_at: unknown };

function reportsBlocking(
  reports: SceneCoherenceReport[],
  scenes: SceneRow[] | null,
  checkedAt: string,
) {
  const updated = new Map<string, string | null>();
  for (const scene of scenes ?? []) {
    updated.set(String(scene.id), typeof scene.updated_at === 'string' ? scene.updated_at : null);
  }
  return blockingScenes(reports, updated, checkedAt);
}

function languageOf(value: unknown): CoherenceLanguage {
  const code = typeof value === 'string' ? value.toLowerCase() : '';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('en')) return 'en';
  return 'fr';
}

/** GET : le dernier rapport enregistré du cours et les scènes qui bloquent encore sa publication. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  const access = await requireCourseEditor(request, courseId);
  if (access.response) return access.response;
  const { course } = access;
  const supabase = createServiceSupabaseClient();

  const { data: row, error } = await supabase
    .from('course_coherence_reports')
    .select('reports, counts, checked_at')
    .eq('course_id', course.id)
    .maybeSingle();
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read the report');
  if (!row) return apiSuccess({ report: null });

  const { data: scenes } = course.stage_id
    ? await supabase.from('scenes').select('id, updated_at').eq('stage_id', course.stage_id)
    : { data: null };
  const reports = row.reports as SceneCoherenceReport[];
  return apiSuccess({
    report: {
      reports,
      counts: row.counts,
      checkedAt: row.checked_at as string,
      blocking: reportsBlocking(reports, scenes, row.checked_at as string),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  const access = await requireCourseEditor(request, courseId);
  if (access.response) return access.response;
  const { course, user } = access;
  if (!course.stage_id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Course has no classroom');
  }
  const supabase = createServiceSupabaseClient();

  try {
    const [{ data: courseRow }, { data: scenes, error: scenesError }] = await Promise.all([
      supabase.from('courses').select('language').eq('id', course.id).maybeSingle(),
      supabase
        .from('scenes')
        .select('id, title, order, actions, updated_at')
        .eq('stage_id', course.stage_id)
        .order('order'),
    ]);
    if (scenesError) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read the scenes');
    }
    const language = languageOf(courseRow?.language);
    const { model, thinkingConfig } = await resolveModelFromRequest(
      request,
      null,
      'coherence-check',
    );

    const reports: SceneCoherenceReport[] = [];
    for (const scene of scenes ?? []) {
      const narration = narrationOf(scene.actions);
      if (!narration) continue;
      const base = { sceneId: scene.id as string, title: (scene.title as string) ?? '' };

      const { data: snapshot } = await supabase.storage
        .from('classroom-media')
        .download(`${course.stage_id}/export/${scene.id}.png`);
      if (!snapshot) {
        reports.push({ ...base, verdict: 'unverified', problems: [] });
        continue;
      }
      const image = Buffer.from(await snapshot.arrayBuffer());
      const { system, prompt } = coherencePrompt(narration, language);
      const response = await runWithUsageMeteringContext(
        withStableIdempotencyKey(new Headers()),
        user.id,
        course.org_id,
        () =>
          callLLM(
            {
              model,
              system,
              // Un verdict tient en quelques centaines de jetons : borner la sortie borne aussi la réservation de crédits.
              maxOutputTokens: MAX_VERDICT_TOKENS,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    { type: 'image', image },
                  ],
                },
              ],
            },
            'coherence-check',
            { retries: 1, validate: (text) => parseCoherence(text) !== null },
            thinkingConfig,
          ),
      );
      const verdict = parseCoherence(response.text);
      reports.push(
        verdict ? { ...base, ...verdict } : { ...base, verdict: 'unreadable', problems: [] },
      );
    }

    const counts = countsOf(reports);
    const checkedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from('course_coherence_reports').upsert({
      course_id: course.id,
      reports,
      counts,
      checked_by: user.id,
      checked_at: checkedAt,
    });
    // Le rapport est déjà facturé : un échec d'enregistrement se dit, il ne cache pas le résultat.
    if (saveError) log.error('Coherence report not saved:', saveError.message);
    return apiSuccess({
      reports,
      counts,
      checkedAt,
      blocking: reportsBlocking(reports, scenes, checkedAt),
    });
  } catch (caught) {
    const creditsResponse = creditsErrorResponse(caught);
    if (creditsResponse) return creditsResponse;
    log.error('Coherence check failed:', caught);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Coherence check failed');
  }
}

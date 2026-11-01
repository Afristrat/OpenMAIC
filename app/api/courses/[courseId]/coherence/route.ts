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
  type SceneCoherence,
} from '@/lib/export/coherence';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireCourseEditor } from '@/lib/server/course-editor-access';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

const log = createLogger('CoherenceCheck');

export const maxDuration = 300;

type SceneReport = {
  sceneId: string;
  title: string;
  verdict: SceneCoherence['verdict'] | 'unverified' | 'unreadable';
  problems: SceneCoherence['problems'];
};

function languageOf(value: unknown): CoherenceLanguage {
  const code = typeof value === 'string' ? value.toLowerCase() : '';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('en')) return 'en';
  return 'fr';
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
        .select('id, title, order, actions')
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

    const reports: SceneReport[] = [];
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

    const counts = {
      coherent: reports.filter((report) => report.verdict === 'coherent').length,
      partial: reports.filter((report) => report.verdict === 'partial').length,
      incoherent: reports.filter((report) => report.verdict === 'incoherent').length,
      unverified: reports.filter((report) => report.verdict === 'unverified').length,
      unreadable: reports.filter((report) => report.verdict === 'unreadable').length,
    };
    return apiSuccess({ reports, counts });
  } catch (caught) {
    const creditsResponse = creditsErrorResponse(caught);
    if (creditsResponse) return creditsResponse;
    log.error('Coherence check failed:', caught);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Coherence check failed');
  }
}

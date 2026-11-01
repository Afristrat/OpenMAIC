/**
 * POST /api/courses/[courseId]/capture-scenes : ajoute au cours les étapes de capture validées,
 * une diapositive par étape (capture réelle, cible encadrée, voix off tirée de la description).
 * Un second appel remplace les diapositives d'étape, il ne les duplique pas.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { addCaptureStepsToCourse, CaptureStepScenesError } from '@/lib/server/capture-step-scenes';
import { requireCourseEditor } from '@/lib/server/course-editor-access';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureScenesAPI');

const bodySchema = z.strictObject({ locale: z.enum(['fr-FR', 'ar-MA', 'en-US']).default('fr-FR') });

export async function POST(request: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  const access = await requireCourseEditor(request, courseId);
  if (access.response) return access.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Requête invalide');

  try {
    const result = await addCaptureStepsToCourse({
      courseId: access.course.id,
      stageId: access.course.stage_id,
      locale: parsed.data.locale,
      baseUrl: request.nextUrl.origin,
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof CaptureStepScenesError) {
      return apiError('INVALID_REQUEST', error.code === 'NOT_FOUND' ? 404 : 409, error.message);
    }
    log.error(
      'Failed to add capture steps to course',
      error instanceof Error ? error.message : error,
    );
    return apiError('INTERNAL_ERROR', 500, "Échec de l'ajout des étapes au cours");
  }
}

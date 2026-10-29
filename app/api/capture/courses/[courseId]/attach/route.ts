/**
 * POST /api/capture/courses/[courseId]/attach : rattache un projet créé par l'extension (sans
 * organisation) à l'organisation où l'auteur va générer la formation.
 *
 * La génération exige que le projet appartienne à l'organisation courante. Le rattachement ne
 * vaut que pour un projet de l'auteur encore sans organisation. Il applique les contrôles de la
 * génération : rôle d'auteur dans une organisation active et limite de cours du plan gratuit
 * (comptage puis écriture, comme à la génération : même garantie, pas plus forte).
 * Un projet déjà rattaché à la même organisation répond OK (idempotent) ; à une autre, 409.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import {
  CourseAccessError,
  FreeCourseLimitError,
  assertFreeCourseLimit,
  assertGenerationAuthor,
} from '@/lib/server/course-generation-access';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureAttachAPI');

const bodySchema = z.strictObject({ orgId: z.uuid() });

export async function POST(request: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const courseId = z.uuid().safeParse((await ctx.params).courseId);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!courseId.success || !body.success)
    return apiError('INVALID_REQUEST', 400, 'Requête invalide');

  const supabase = createServiceSupabaseClient();
  const { data: course } = await supabase
    .from('courses')
    .select('id, org_id')
    .eq('id', courseId.data)
    .eq('owner_id', auth.user.id)
    .maybeSingle();
  if (!course) return apiError('INVALID_REQUEST', 404, 'Projet introuvable');

  const current = (course.org_id as string | null) ?? null;
  if (current === body.data.orgId) return apiSuccess({ courseId: courseId.data });
  if (current !== null) {
    return apiError('INVALID_REQUEST', 409, 'Ce projet appartient déjà à une autre organisation');
  }

  try {
    await assertGenerationAuthor(body.data.orgId, auth.user.id);
    await assertFreeCourseLimit(body.data.orgId);
  } catch (error) {
    if (error instanceof FreeCourseLimitError)
      return apiError('QUOTA_EXCEEDED', 429, error.message);
    if (error instanceof CourseAccessError) return apiError('INVALID_REQUEST', 403, error.message);
    log.error(
      'Failed to authorize course attachment',
      error instanceof Error ? error.message : error,
    );
    return apiError('INTERNAL_ERROR', 500, 'Échec du rattachement');
  }

  const { error } = await supabase
    .from('courses')
    .update({ org_id: body.data.orgId })
    .eq('id', courseId.data)
    .eq('owner_id', auth.user.id)
    .is('org_id', null);
  if (error) {
    log.error('Failed to attach course to organization', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec du rattachement');
  }
  return apiSuccess({ courseId: courseId.data });
}

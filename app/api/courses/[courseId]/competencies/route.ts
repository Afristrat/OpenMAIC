import { z } from 'zod';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

/**
 * Liens d'une formation et de ses scènes vers le référentiel commun de compétences.
 * Niveau formation : compétences visées par le cours. Niveau scène : compétences travaillées ou
 * évaluées, proposées puis confirmées par une personne. On ne stocke que l'URI et la version lue.
 */

const courseLink = z.object({
  uri: z.string().min(1).max(500),
  version: z.string().min(1).max(100),
  isco08: z
    .string()
    .regex(/^[0-9]{4}$/)
    .optional(),
  nature: z.enum(['essentielle', 'optionnelle']).default('essentielle'),
});

const sceneLink = z.object({
  sceneId: z.string().min(1),
  uri: z.string().min(1).max(500),
  version: z.string().min(1).max(100),
  nature: z.enum(['travaillee', 'evaluee']).default('travaillee'),
  statut: z.enum(['propose', 'confirme']).default('propose'),
});

const bodySchema = z
  .object({
    course: z.array(courseLink).max(500).optional(),
    scenes: z.array(sceneLink).max(2000).optional(),
  })
  .refine((body) => body.course !== undefined || body.scenes !== undefined);

type Params = { params: Promise<{ courseId: string }> };

async function readCourse(courseId: string) {
  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .select('id, org_id, owner_id, stage_id')
    .eq('id', courseId)
    .maybeSingle();
  return { course: data, error };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { courseId } = await params;
  const { course, error } = await readCourse(courseId);
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course');
  if (!course?.org_id) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');

  const auth = await requireSuperAdminOrOrgEditor(
    request,
    course.org_id,
    course.owner_id,
    course.stage_id ?? undefined,
  );
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const sceneIds = course.stage_id
    ? await supabase.from('scenes').select('id').eq('stage_id', course.stage_id)
    : { data: [], error: null };
  if (sceneIds.error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read scenes');

  const [courseLinks, sceneLinks] = await Promise.all([
    supabase
      .from('course_competencies')
      .select('competency_uri, referential_version, isco_08, nature')
      .eq('course_id', courseId),
    supabase
      .from('scene_competencies')
      .select('scene_id, competency_uri, referential_version, nature, statut')
      .in(
        'scene_id',
        (sceneIds.data ?? []).map((scene) => scene.id),
      ),
  ]);
  if (courseLinks.error || sceneLinks.error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read competency links');
  }
  return apiSuccess({ course: courseLinks.data ?? [], scenes: sceneLinks.data ?? [] });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { courseId } = await params;
  const { course, error } = await readCourse(courseId);
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course');
  if (!course?.org_id) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');

  const auth = await requireSuperAdminOrOrgEditor(
    request,
    course.org_id,
    course.owner_id,
    course.stage_id ?? undefined,
  );
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid body');
  const { course: courseItems, scenes: sceneItems } = parsed.data;

  const supabase = createServiceSupabaseClient();

  if (courseItems) {
    const rows = courseItems.map((item) => ({
      course_id: courseId,
      org_id: course.org_id,
      competency_uri: item.uri,
      referential_version: item.version,
      isco_08: item.isco08 ?? null,
      nature: item.nature,
      created_by: auth.user.id,
    }));
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('course_competencies')
        .upsert(rows, { onConflict: 'course_id,competency_uri' });
      if (upsertError) {
        return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to save course competencies');
      }
    }
    // Insérer d'abord puis retirer : un échec en cours de route laisse un sur-ensemble, jamais un trou.
    const kept = courseItems.map((item) => item.uri);
    const removal = supabase.from('course_competencies').delete().eq('course_id', courseId);
    const { error: deleteError } = await (kept.length > 0
      ? removal.not(
          'competency_uri',
          'in',
          `(${kept.map((uri) => `"${uri.replace(/"/g, '\\"')}"`).join(',')})`,
        )
      : removal);
    if (deleteError) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to prune course competencies');
    }
  }

  if (sceneItems) {
    const ids = [...new Set(sceneItems.map((item) => item.sceneId))];
    if (ids.length > 0) {
      if (!course.stage_id) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Course has no classroom');
      }
      const { data: owned, error: scenesError } = await supabase
        .from('scenes')
        .select('id')
        .eq('stage_id', course.stage_id)
        .in('id', ids);
      if (scenesError)
        return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read scenes');
      if ((owned ?? []).length !== ids.length) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unknown scene for this course');
      }
      const now = new Date().toISOString();
      const rows = sceneItems.map((item) => ({
        scene_id: item.sceneId,
        org_id: course.org_id,
        competency_uri: item.uri,
        referential_version: item.version,
        nature: item.nature,
        statut: item.statut,
        confirmed_by: item.statut === 'confirme' ? auth.user.id : null,
        confirmed_at: item.statut === 'confirme' ? now : null,
      }));
      const { error: upsertError } = await supabase
        .from('scene_competencies')
        .upsert(rows, { onConflict: 'scene_id,competency_uri,nature' });
      if (upsertError) {
        return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to save scene competencies');
      }
    }
  }

  return apiSuccess({
    courseId,
    course: courseItems?.length ?? null,
    scenes: sceneItems?.length ?? null,
  });
}

import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireSuperAdminOrOrgAdmin, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { isFeatureEnabled } from '@/lib/flags';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { latestVideoByStage } from '@/lib/courses/catalog-videos';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  const includeUnpublished = request.nextUrl.searchParams.get('includeUnpublished') === 'true';
  if (!orgId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'orgId is required');
  }

  const auth = await requireSuperAdminOrOrgMember(request, orgId);
  if (auth.response) return auth.response;

  if (!(await isFeatureEnabled('course_catalog'))) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course catalog is unavailable');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, language, stage_id, created_at')
    .eq('org_id', orgId)
    .eq('status', 'ready')
    .eq('catalog_visible', true)
    .not('stage_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load course catalog');
  }

  const videos = await loadCatalogVideos((data ?? []).map((course) => course.stage_id));

  if (!includeUnpublished) {
    return apiSuccess({ courses: serializeCourses(data ?? [], videos) });
  }

  const admin = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (admin.response) return admin.response;

  const { data: unpublished, error: unpublishedError } = await supabase
    .from('courses')
    .select('id, title, language, stage_id, created_at')
    .eq('org_id', orgId)
    .eq('status', 'ready')
    .eq('catalog_visible', false)
    .not('stage_id', 'is', null)
    .order('created_at', { ascending: false });

  if (unpublishedError) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load unpublished courses');
  }

  return apiSuccess({
    courses: serializeCourses(data ?? [], videos),
    unpublished: serializeCourses(unpublished ?? []),
  });
}

interface CourseRow {
  id: string;
  title: string;
  language: string;
  stage_id: string | null;
  created_at: string;
}

/** Dernier export MP4 terminé par formation du catalogue. Le droit de lire la vidéo est revérifié par sa route. */
async function loadCatalogVideos(stageIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = stageIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map();
  const { data } = await createServiceSupabaseClient()
    .from('export_jobs')
    .select('id, stage_id, created_at')
    .in('stage_id', ids)
    .eq('format', 'mp4')
    .eq('status', 'done');
  return latestVideoByStage(data ?? []);
}

function serializeCourses(courses: CourseRow[], videos: Map<string, string> = new Map()) {
  return courses.flatMap((course) =>
    course.stage_id
      ? [
          {
            id: course.id,
            title: course.title,
            language: course.language,
            classroomId: course.stage_id,
            createdAt: course.created_at,
            videoExportId: videos.get(course.stage_id) ?? null,
          },
        ]
      : [],
  );
}

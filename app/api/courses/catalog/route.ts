import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { isFeatureEnabled } from '@/lib/flags';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
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

  return apiSuccess({
    courses: (data ?? []).flatMap((course) =>
      course.stage_id
        ? [
            {
              id: course.id,
              title: course.title,
              language: course.language,
              classroomId: course.stage_id,
              createdAt: course.created_at,
            },
          ]
        : [],
    ),
  });
}

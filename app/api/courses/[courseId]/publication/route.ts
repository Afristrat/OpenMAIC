import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { NextRequest } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  let body: { orgId?: unknown; visible?: unknown };
  try {
    body = (await request.json()) as { orgId?: unknown; visible?: unknown };
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  if (typeof body.orgId !== 'string' || typeof body.visible !== 'boolean') {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'orgId and visible are required');
  }

  const auth = await requireSuperAdminOrOrgAdmin(request, body.orgId);
  if (auth.response) return auth.response;

  const { courseId } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: course, error: readError } = await supabase
    .from('courses')
    .select('id, status')
    .eq('id', courseId)
    .eq('org_id', body.orgId)
    .maybeSingle();

  if (readError) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course');
  }
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  }
  if (course.status !== 'ready') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Only ready courses can be published');
  }

  const { error: updateError } = await supabase
    .from('courses')
    .update({ catalog_visible: body.visible })
    .eq('id', courseId)
    .eq('org_id', body.orgId);
  if (updateError) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update course publication');
  }

  return apiSuccess({ courseId, catalogVisible: body.visible });
}

import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Formations prêtes d'une organisation, à relier aux compétences du référentiel : `?orgId=<id>`. */
export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'orgId is required');
  }

  const auth = await requireSuperAdminOrOrgMember(request, orgId);
  if (auth.response) return auth.response;

  const { data, error } = await (await createServerSupabaseClient())
    .from('courses')
    .select('id, title, language')
    .eq('org_id', orgId)
    .eq('status', 'ready')
    .not('stage_id', 'is', null)
    .order('title');
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load courses');

  return apiSuccess({ courses: data ?? [] });
}

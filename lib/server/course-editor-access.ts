import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSuperAdminEmail, requireAuth, requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type GrantedUser = Extract<
  Awaited<ReturnType<typeof requireSuperAdminOrOrgEditor>>,
  { user: unknown }
>['user'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditableCourse = {
  id: string;
  org_id: string;
  owner_id: string;
  stage_id: string | null;
};

const forbidden = () =>
  NextResponse.json(
    { error: 'Classroom editor access required', code: 'FORBIDDEN', status: 403 },
    { status: 403 },
  );

/**
 * Droit d'édition d'une formation, dans un ordre qui ne révèle rien : la session d'abord (401 sans
 * session, avant toute lecture), puis la formation, puis le rôle dans son organisation. Une formation
 * inconnue et une formation réelle que la personne ne peut pas éditer reçoivent la même réponse 403 ;
 * seul le super-administrateur voit un 404, car il peut de toute façon tout lister.
 */
export async function requireCourseEditor(
  request: NextRequest,
  courseId: string,
): Promise<
  { response: Response } | { response?: undefined; course: EditableCourse; user: GrantedUser }
> {
  const auth = await requireAuth(request);
  if (auth.response) return { response: auth.response };

  if (!UUID.test(courseId)) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course id') };
  }

  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .select('id, org_id, owner_id, stage_id')
    .eq('id', courseId)
    .maybeSingle();
  if (error)
    return { response: apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read course') };
  if (!data?.org_id) {
    return {
      response: isSuperAdminEmail(auth.user.email)
        ? apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found')
        : forbidden(),
    };
  }

  const editor = await requireSuperAdminOrOrgEditor(
    request,
    data.org_id,
    data.owner_id,
    data.stage_id ?? undefined,
  );
  if (editor.response) return { response: editor.response };
  return { course: { ...data, org_id: data.org_id }, user: editor.user };
}

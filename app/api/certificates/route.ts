import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CERTIFICATE_COLUMNS =
  'id, user_id, stage_id, course_name, learner_name, completion_date, score, skills, verification_code, issued_by, org_id, created_at';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError(API_ERROR_CODES.UNAUTHORIZED, 401, 'Authentication required');
    }

    const { data, error } = await supabase
      .from('certificates')
      .select(CERTIFICATE_COLUMNS)
      .eq('user_id', user.id)
      .order('completion_date', { ascending: false });

    if (error) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to load certificates',
        error.message,
      );
    }

    return apiSuccess({ certificates: data ?? [] });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load certificates',
      error instanceof Error ? error.message : String(error),
    );
  }
}

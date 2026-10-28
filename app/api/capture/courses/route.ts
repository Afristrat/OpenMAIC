/**
 * GET /api/capture/courses : projets de l'auteur connecté (cookie de session), avec le nombre de
 * sessions de capture de chacun. Sert de sélecteur à la page Captures.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureCoursesAPI');

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const [courses, sessions] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, language, status, updated_at')
      .eq('owner_id', auth.user.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase.from('capture_sessions').select('course_id').eq('owner_id', auth.user.id),
  ]);
  if (courses.error || sessions.error) {
    log.error('Failed to list capture courses', courses.error?.message ?? sessions.error?.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la lecture des projets');
  }

  const counts = new Map<string, number>();
  for (const row of (sessions.data ?? []) as { course_id: string }[]) {
    counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1);
  }
  const response = apiSuccess({
    courses: ((courses.data ?? []) as { id: string }[]).map((course) => ({
      ...course,
      sessionCount: counts.get(course.id) ?? 0,
    })),
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

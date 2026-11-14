import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const page = Number(request.nextUrl.searchParams.get('page') ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 20_000) {
    return apiError('INVALID_REQUEST', 400, 'Invalid course page');
  }

  const pageSize = 25;
  const offset = page * pageSize;
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('stages')
    .select('id,name,created_at')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize);
  if (error) return apiError('INTERNAL_ERROR', 500, 'Unable to list courses');

  const courses = (data ?? []).slice(0, pageSize);
  if (courses.length === 0) return apiSuccess({ courses: [], hasMore: false });

  const { data: exports, error: exportError } = await db
    .from('export_jobs')
    .select('id,stage_id,status,format,scene_count')
    .eq('owner_id', auth.user.id)
    .in('format', ['video', 'mp4'])
    .in(
      'stage_id',
      courses.map((course) => course.id),
    )
    .order('created_at', { ascending: false });
  if (exportError) return apiError('INTERNAL_ERROR', 500, 'Unable to list course videos');

  return apiSuccess({
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      createdAt: course.created_at,
      video: exports?.find((job) => job.stage_id === course.id),
    })),
    hasMore: (data?.length ?? 0) > pageSize,
  });
}

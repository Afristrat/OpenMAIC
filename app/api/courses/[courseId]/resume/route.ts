import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import { recoverImportedCoursePlan } from '@/lib/server/course-plan-recovery';
import {
  CourseAccessError,
  loadOwnedCourseForGeneration,
} from '@/lib/server/course-generation-access';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const ids = z
    .object({ courseId: z.string().uuid(), orgId: z.string().uuid() })
    .safeParse({ ...(await context.params), orgId: request.nextUrl.searchParams.get('orgId') });
  if (!ids.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400, headers });
  try {
    const course = await loadOwnedCourseForGeneration(
      ids.data.courseId,
      ids.data.orgId,
      auth.user.id,
    );
    const savedPlan = approvedClassroomPlanSchema.safeParse(course.outline.plan);
    const plan = savedPlan.success
      ? savedPlan.data
      : await recoverImportedCoursePlan(course, ids.data.orgId, auth.user.id);
    if (!plan)
      return NextResponse.json(
        { error: 'Saved plan unavailable', code: 'PLAN_UNAVAILABLE' },
        { status: 409, headers },
      );
    return NextResponse.json(
      {
        courseId: course.id,
        orgId: ids.data.orgId,
        sourceManifestId: course.source_manifest_id,
        language: course.language,
        plan,
        planOrigin: savedPlan.success ? 'saved' : 'linked_canvas',
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Course unavailable' },
      { status: error instanceof CourseAccessError ? 403 : 503, headers },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import {
  LearnerCourseResumeAccessError,
  resolveLearnerCourseResume,
} from '@/lib/server/learner-course-resume';
import { apiError } from '@/lib/server/api-response';

const headers = { 'Cache-Control': 'private, no-store' };
const paramsSchema = z.object({ courseId: z.string().uuid() });
const querySchema = z.object({ orgId: z.string().uuid() });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse({ orgId: request.nextUrl.searchParams.get('orgId') });
  if (!params.success || !query.success)
    return apiError('INVALID_REQUEST', 400, 'Cible de reprise invalide');
  try {
    const resume = await resolveLearnerCourseResume({
      actorId: auth.user.id,
      courseId: params.data.courseId,
      orgId: query.data.orgId,
    });
    if (!resume) return apiError('INVALID_REQUEST', 404, 'Reprise de formation indisponible');
    return NextResponse.json(
      {
        success: true,
        target: {
          stageId: resume.stage_id,
          sceneId: resume.scene_id,
          activity: resume.activity,
          activityState: resume.activity_state,
          positionMs: resume.position_ms,
        },
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof LearnerCourseResumeAccessError)
      return apiError('INVALID_REQUEST', 404, 'Reprise de formation indisponible');
    return apiError('INTERNAL_ERROR', 503, 'La reprise ne peut pas être résolue');
  }
}

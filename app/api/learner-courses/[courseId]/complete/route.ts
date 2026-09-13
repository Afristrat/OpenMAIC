import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import {
  completeLearnerCourseResume,
  LearnerCourseResumeAccessError,
} from '@/lib/server/learner-course-resume';
import { apiError } from '@/lib/server/api-response';

const headers = { 'Cache-Control': 'private, no-store' };
const paramsSchema = z.object({ courseId: z.string().uuid() });
const bodySchema = z.object({ orgId: z.string().uuid() });

function isTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  try {
    if (configured && origin === new URL(configured).origin) return true;
  } catch {
    // The canonical production origin remains the fail-closed fallback.
  }
  return origin === 'https://qalem.ma';
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isTrustedOrigin(request)) return apiError('INVALID_REQUEST', 403, 'Origine non autorisée');
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success)
    return apiError('INVALID_REQUEST', 400, 'Achèvement de formation invalide');
  try {
    const resume = await completeLearnerCourseResume({
      actorId: auth.user.id,
      courseId: params.data.courseId,
      orgId: body.data.orgId,
    });
    return NextResponse.json({ success: true, resume }, { headers });
  } catch (error) {
    if (error instanceof LearnerCourseResumeAccessError)
      return apiError('INVALID_REQUEST', 403, 'Achèvement de formation indisponible');
    return apiError('INTERNAL_ERROR', 503, 'La fin de formation ne peut pas être enregistrée');
  }
}

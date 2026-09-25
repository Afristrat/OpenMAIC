import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import {
  LearnerCourseResumeAccessError,
  markLearnerCourseResumeDeliveryOpened,
} from '@/lib/server/learner-course-resume';
import { apiError } from '@/lib/server/api-response';

const paramsSchema = z.object({ courseId: z.string().uuid(), deliveryId: z.string().uuid() });

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
  context: { params: Promise<{ courseId: string; deliveryId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isTrustedOrigin(request)) return apiError('INVALID_REQUEST', 403, 'Origine non autorisée');
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return apiError('INVALID_REQUEST', 400, 'Rappel de reprise invalide');
  try {
    await markLearnerCourseResumeDeliveryOpened({
      actorId: auth.user.id,
      courseId: params.data.courseId,
      deliveryId: params.data.deliveryId,
    });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof LearnerCourseResumeAccessError)
      return apiError('INVALID_REQUEST', 404, 'Rappel de reprise indisponible');
    return apiError('INTERNAL_ERROR', 503, 'L’ouverture du rappel ne peut pas être attestée');
  }
}

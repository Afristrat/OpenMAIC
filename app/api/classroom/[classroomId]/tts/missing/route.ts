import { NextRequest } from 'next/server';
import { assertClassroomEditAccess } from '@/lib/server/classroom-edit-access';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { insufficientCreditsResponse } from '@/lib/server/credit-error-response';
import {
  completeMissingSpeechAudio,
  VoiceCompletionError,
} from '@/lib/server/classroom-voice-completion';
import {
  buildRequestOrigin,
  isValidClassroomId,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';

/**
 * Generates only the voices a persisted course is missing. The answer always says what stayed
 * silent: a partial success is a 200 with the remaining lines, never a silent gap.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  if (!isValidClassroomId(classroomId)) {
    return apiError('INVALID_REQUEST', 400, 'Classroom invalide');
  }
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  const auth = await requireSuperAdminOrOrgEditor(
    request,
    ownership.orgId,
    ownership.ownerId,
    classroomId,
  );
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => null)) as { sceneId?: unknown } | null;
  const sceneId = typeof body?.sceneId === 'string' ? body.sceneId : undefined;

  try {
    const report = await runWithUsageMeteringContext(
      withStableIdempotencyKey(request.headers),
      auth.user.id,
      ownership.orgId,
      () =>
        completeMissingSpeechAudio({
          classroomId,
          ownerId: ownership.ownerId,
          orgId: ownership.orgId,
          baseUrl: buildRequestOrigin(request),
          sceneId,
          assertAccess: () =>
            assertClassroomEditAccess(request, classroomId, ownership, auth.user.id),
        }),
    );
    // Rien n'a pu être généré faute de solde : une réponse 402 explicite, pas un 200 « tout a échoué ».
    if (report.creditsBlocked && report.generated === 0) return insufficientCreditsResponse();
    return apiSuccess({
      creditsBlocked: report.creditsBlocked === true,
      requested: report.requested,
      generated: report.generated,
      failed: report.failed,
      updatedScenes: report.updatedScenes,
    });
  } catch (error) {
    if (error instanceof VoiceCompletionError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 422;
      return apiError('INVALID_REQUEST', status, error.message);
    }
    throw error;
  }
}

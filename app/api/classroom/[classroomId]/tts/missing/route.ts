import { NextRequest } from 'next/server';
import { assertClassroomEditAccess } from '@/lib/server/classroom-edit-access';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { completeMissingSpeechAudio } from '@/lib/server/classroom-voice-completion';
import { startVoiceCompletionJob } from '@/lib/server/voice-completion-jobs';
import {
  buildRequestOrigin,
  isValidClassroomId,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';

/**
 * Starts the generation of the voices a persisted course is missing and answers at once with the
 * job to follow (GET .../tts/missing/<jobId>): a scene takes minutes, far longer than the ≈ 125 s
 * after which the edge closes a request. The job always says what stayed silent: a partial
 * success is reported with the remaining lines, never a silent gap.
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
  const baseUrl = buildRequestOrigin(request);
  const idempotencyKey = withStableIdempotencyKey(request.headers);

  const job = startVoiceCompletionJob({ classroomId, sceneId }, (onProgress) =>
    runWithUsageMeteringContext(idempotencyKey, auth.user.id, ownership.orgId, () =>
      completeMissingSpeechAudio({
        classroomId,
        ownerId: ownership.ownerId,
        orgId: ownership.orgId,
        baseUrl,
        sceneId,
        onProgress,
        assertAccess: () => assertClassroomEditAccess(request, classroomId, ownership, auth.user.id),
      }),
    ),
  );
  return apiSuccess({ jobId: job.id }, 202);
}

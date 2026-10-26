import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import { readVoiceCompletionJob } from '@/lib/server/voice-completion-jobs';

/** State of a voice completion job: what is done, what stayed silent, and the refreshed scenes. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string; jobId: string }> },
) {
  const { classroomId, jobId } = await params;
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

  const job = readVoiceCompletionJob(jobId);
  // A job of another classroom is as unknown as a missing one: the id alone opens nothing.
  if (!job || job.classroomId !== classroomId) {
    return apiError('INVALID_REQUEST', 404, 'Tâche introuvable');
  }
  return apiSuccess({
    status: job.status,
    requested: job.requested,
    generated: job.generated,
    failed: job.failed,
    creditsBlocked: job.creditsBlocked,
    // Only a finished job carries the scenes: a running one still changes them.
    updatedScenes: job.status === 'running' ? [] : job.updatedScenes,
    ...(job.error ? { error: job.error } : {}),
  });
}

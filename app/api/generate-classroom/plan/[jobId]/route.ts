import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidClassroomPlanJobId,
  readClassroomPlanJob,
} from '@/lib/server/classroom-plan-job-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    if (!isValidClassroomPlanJobId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom plan job id');
    }
    const job = await readClassroomPlanJob(jobId);
    if (!job) return apiError('INVALID_REQUEST', 404, 'Classroom plan job not found');
    const auth = await requireSuperAdminOrOrgAuthor(request, job.orgId);
    if (auth.response) return auth.response;

    return apiSuccess({
      jobId: job.id,
      status: job.status,
      message: job.message,
      pollIntervalMs: 30_000,
      done: job.status === 'succeeded' || job.status === 'failed',
      result: job.result,
      generationRequest: job.status === 'succeeded' ? job.input : undefined,
      error: job.error,
      errorCode: job.errorCode,
      sourceAlignment: job.sourceAlignment,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve classroom plan job',
      error instanceof Error ? error.message : String(error),
    );
  }
}

import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { describeGenerationFailure } from '@/lib/generation/generation-tracking';
import { getTypicalDuration } from '@/lib/server/generation-duration-stats';
import { isDesignSystemV1Enabled } from '@/lib/branding/design-directive';
import { brandCharterFromSettings } from '@/lib/branding/brand-charter';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
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

    const done = job.status === 'succeeded' || job.status === 'failed';
    const { data: organization } = await createServiceSupabaseClient()
      .from('organizations')
      .select('settings')
      .eq('id', job.orgId)
      .maybeSingle();
    return apiSuccess({
      jobId: job.id,
      status: job.status,
      message: job.message,
      pollIntervalMs: 5_000,
      step: job.step,
      startedAt: job.startedAt ?? job.createdAt,
      updatedAt: job.updatedAt,
      serverNow: new Date().toISOString(),
      typicalDuration: done ? undefined : await getTypicalDuration('plan'),
      failure: describeGenerationFailure(job.error),
      designSystemEnabled: isDesignSystemV1Enabled(organization?.settings),
      brandCharter: brandCharterFromSettings(organization?.settings),
      done,
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

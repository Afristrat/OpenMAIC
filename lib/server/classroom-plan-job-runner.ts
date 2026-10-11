import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';
import {
  markClassroomPlanJobConflict,
  markClassroomPlanJobFailed,
  markClassroomPlanJobRunning,
  markClassroomPlanJobSucceeded,
  reportClassroomPlanStep,
  touchClassroomPlanJob,
} from '@/lib/server/classroom-plan-job-store';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { SourceMaterialConflictError } from '@/lib/server/source-material-alignment';
import { activateUsageMeteringJob } from '@/lib/billing/usage-context';

const PLAN_HEARTBEAT_MS = 20_000;

export async function runClassroomPlanJob(
  jobId: string,
  input: GenerateClassroomInput,
  ownerId?: string,
): Promise<void> {
  await markClassroomPlanJobRunning(jobId);
  const heartbeat = setInterval(() => {
    void touchClassroomPlanJob(jobId).catch(() => undefined);
  }, PLAN_HEARTBEAT_MS);
  heartbeat.unref();
  try {
    if (ownerId) activateUsageMeteringJob(ownerId, input.orgId, jobId);
    const plan = await generateClassroomPlan(input, ownerId, {
      onStep: (step) => reportClassroomPlanStep(jobId, step).then(() => undefined),
    });
    await markClassroomPlanJobSucceeded(jobId, plan);
  } catch (error) {
    if (error instanceof SourceMaterialConflictError) {
      await markClassroomPlanJobConflict(jobId, error.alignment);
      return;
    }
    await markClassroomPlanJobFailed(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

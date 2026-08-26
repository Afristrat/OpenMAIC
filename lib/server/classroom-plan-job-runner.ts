import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';
import {
  markClassroomPlanJobConflict,
  markClassroomPlanJobFailed,
  markClassroomPlanJobRunning,
  markClassroomPlanJobSucceeded,
} from '@/lib/server/classroom-plan-job-store';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { SourceMaterialConflictError } from '@/lib/server/source-material-alignment';

export async function runClassroomPlanJob(
  jobId: string,
  input: GenerateClassroomInput,
): Promise<void> {
  await markClassroomPlanJobRunning(jobId);
  try {
    await markClassroomPlanJobSucceeded(jobId, await generateClassroomPlan(input));
  } catch (error) {
    if (error instanceof SourceMaterialConflictError) {
      await markClassroomPlanJobConflict(jobId, error.alignment);
      return;
    }
    await markClassroomPlanJobFailed(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

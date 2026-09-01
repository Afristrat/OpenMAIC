import { createLogger } from '@/lib/logger';
import { generateClassroom, type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  markClassroomGenerationJobFailed,
  markClassroomGenerationJobRunning,
  markClassroomGenerationJobSucceeded,
  touchClassroomGenerationJob,
  updateClassroomGenerationJobProgress,
} from '@/lib/server/classroom-job-store';
import { activateUsageMeteringJob } from '@/lib/billing/usage-context';

const log = createLogger('ClassroomJob');
const runningJobs = new Map<string, Promise<void>>();

export function runClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
  baseUrl: string,
  ownerId: string,
): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    const heartbeat = setInterval(() => {
      void touchClassroomGenerationJob(jobId).catch((error) => {
        log.warn(`Classroom generation heartbeat failed for ${jobId}:`, error);
      });
    }, 60_000);
    heartbeat.unref();
    try {
      await markClassroomGenerationJobRunning(jobId);
      activateUsageMeteringJob(ownerId, input.orgId, `classroom-${jobId}`);

      const result = await generateClassroom(input, {
        baseUrl,
        ownerId,
        onProgress: async (progress) => {
          await updateClassroomGenerationJobProgress(jobId, progress);
        },
      });

      await markClassroomGenerationJobSucceeded(jobId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Classroom generation job ${jobId} failed:`, error);
      try {
        await markClassroomGenerationJobFailed(jobId, message);
      } catch (markFailedError) {
        log.error(`Failed to persist failed status for job ${jobId}:`, markFailedError);
      }
    } finally {
      clearInterval(heartbeat);
      runningJobs.delete(jobId);
    }
  })();

  runningJobs.set(jobId, jobPromise);
  return jobPromise;
}

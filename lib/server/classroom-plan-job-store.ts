import type { ClassroomPlan } from '@/lib/types/generation';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import type { SourceAlignmentVerdict } from '@/lib/server/source-material-alignment';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type ClassroomPlanJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ClassroomPlanJob {
  id: string;
  kind: 'classroom-plan';
  status: ClassroomPlanJobStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  orgId: string;
  input?: GenerateClassroomInput;
  result?: ClassroomPlan;
  error?: string;
  errorCode?: 'SOURCE_MATERIAL_CONFLICT';
  sourceAlignment?: SourceAlignmentVerdict;
}

export function isValidClassroomPlanJobId(jobId: string): boolean {
  return /^plan-[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createClassroomPlanJob(
  jobId: string,
  input: GenerateClassroomInput,
  ownerId: string,
): Promise<ClassroomPlanJob> {
  const now = new Date().toISOString();
  const durableInput = { ...input };
  delete durableInput.webSearchApiKey;
  const job: ClassroomPlanJob = {
    id: jobId,
    kind: 'classroom-plan',
    status: 'queued',
    message: 'Classroom plan queued',
    createdAt: now,
    updatedAt: now,
    ownerId,
    orgId: input.orgId,
    input: durableInput,
  };
  const { error } = await createServiceSupabaseClient().from('classroom_generation_jobs').insert({
    id: jobId,
    owner_id: ownerId,
    org_id: input.orgId,
    status: job.status,
    payload: job,
  });
  if (error) throw new Error(`Failed to persist classroom plan job: ${error.message}`);
  return job;
}

export async function readClassroomPlanJob(jobId: string): Promise<ClassroomPlanJob | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .select('payload, updated_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read classroom plan job: ${error.message}`);
  if (!data) return null;
  const job = data.payload as ClassroomPlanJob;
  if (job.kind !== 'classroom-plan') return null;
  if (
    job.status === 'running' &&
    Date.now() - new Date(data.updated_at as string).getTime() > 30 * 60 * 1000
  ) {
    const interrupted: ClassroomPlanJob = {
      ...job,
      status: 'failed',
      message: 'Classroom plan preparation was interrupted',
      error: 'Stale classroom plan job',
      updatedAt: new Date().toISOString(),
    };
    const { error: updateError } = await createServiceSupabaseClient()
      .from('classroom_generation_jobs')
      .update({
        status: interrupted.status,
        payload: interrupted,
        updated_at: interrupted.updatedAt,
      })
      .eq('id', jobId);
    if (updateError) {
      throw new Error(`Failed to expire classroom plan job: ${updateError.message}`);
    }
    return interrupted;
  }
  return job;
}

async function updateClassroomPlanJob(
  jobId: string,
  patch: Partial<ClassroomPlanJob>,
): Promise<ClassroomPlanJob> {
  const existing = await readClassroomPlanJob(jobId);
  if (!existing) throw new Error(`Classroom plan job not found: ${jobId}`);
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  const { error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .update({ status: updated.status, payload: updated, updated_at: updated.updatedAt })
    .eq('id', jobId);
  if (error) throw new Error(`Failed to update classroom plan job: ${error.message}`);
  return updated;
}

export function markClassroomPlanJobRunning(jobId: string): Promise<ClassroomPlanJob> {
  return updateClassroomPlanJob(jobId, {
    status: 'running',
    message: 'Classroom plan preparation started',
    error: undefined,
    errorCode: undefined,
    sourceAlignment: undefined,
  });
}

export function markClassroomPlanJobSucceeded(
  jobId: string,
  result: ClassroomPlan,
): Promise<ClassroomPlanJob> {
  return updateClassroomPlanJob(jobId, {
    status: 'succeeded',
    message: 'Classroom plan prepared',
    result,
    error: undefined,
    errorCode: undefined,
    sourceAlignment: undefined,
  });
}

export function markClassroomPlanJobConflict(
  jobId: string,
  sourceAlignment: SourceAlignmentVerdict,
): Promise<ClassroomPlanJob> {
  return updateClassroomPlanJob(jobId, {
    status: 'failed',
    message: 'Source material conflicts with the request',
    error: 'The request and attached document do not match',
    errorCode: 'SOURCE_MATERIAL_CONFLICT',
    sourceAlignment,
  });
}

export function markClassroomPlanJobFailed(
  jobId: string,
  error: string,
): Promise<ClassroomPlanJob> {
  return updateClassroomPlanJob(jobId, {
    status: 'failed',
    message: 'Classroom plan preparation failed',
    error,
  });
}

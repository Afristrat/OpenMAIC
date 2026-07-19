import type {
  ClassroomGenerationProgress,
  ClassroomGenerationStep,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type ClassroomGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ClassroomGenerationJob {
  id: string;
  status: ClassroomGenerationJobStatus;
  step: ClassroomGenerationStep | 'queued' | 'failed';
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  ownerId?: string;
  orgId?: string;
  inputSummary: {
    requirementPreview: string;
    hasPdf: boolean;
    pdfTextLength: number;
    pdfImageCount: number;
  };
  scenesGenerated: number;
  totalScenes?: number;
  result?: { classroomId: string; url: string; scenesCount: number };
  error?: string;
}

const STALE_JOB_TIMEOUT_MS = 30 * 60 * 1000;

function buildInputSummary(input: GenerateClassroomInput): ClassroomGenerationJob['inputSummary'] {
  return {
    requirementPreview:
      input.requirement.length > 200 ? `${input.requirement.slice(0, 197)}...` : input.requirement,
    hasPdf: !!input.pdfContent,
    pdfTextLength: input.pdfContent?.text.length || 0,
    pdfImageCount: input.pdfContent?.images.length || 0,
  };
}

function markStaleIfNeeded(job: ClassroomGenerationJob): ClassroomGenerationJob {
  if (
    job.status !== 'running' ||
    Date.now() - new Date(job.updatedAt).getTime() <= STALE_JOB_TIMEOUT_MS
  )
    return job;
  const now = new Date().toISOString();
  return {
    ...job,
    status: 'failed',
    step: 'failed',
    message: 'La génération a été interrompue par un redémarrage du service.',
    error: 'Stale job: process restarted during generation',
    completedAt: now,
    updatedAt: now,
  };
}

export function isValidClassroomJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
  ownerId: string,
): Promise<ClassroomGenerationJob> {
  const now = new Date().toISOString();
  const job: ClassroomGenerationJob = {
    id: jobId,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: 'Classroom generation job queued',
    createdAt: now,
    updatedAt: now,
    ownerId,
    orgId: input.orgId,
    inputSummary: buildInputSummary(input),
    scenesGenerated: 0,
  };
  const { error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .insert({
      id: jobId,
      owner_id: ownerId,
      org_id: input.orgId,
      status: job.status,
      payload: job,
    });
  if (error) throw new Error(`Failed to persist generation job: ${error.message}`);
  return job;
}

export async function readClassroomGenerationJob(
  jobId: string,
): Promise<ClassroomGenerationJob | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .select('payload')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read generation job: ${error.message}`);
  if (!data) return null;
  const job = markStaleIfNeeded(data.payload as ClassroomGenerationJob);
  if (
    job.status === 'failed' &&
    job.completedAt &&
    job.updatedAt !== (data.payload as ClassroomGenerationJob).updatedAt
  )
    await persistJob(job);
  return job;
}

async function persistJob(job: ClassroomGenerationJob): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .update({ status: job.status, payload: job, updated_at: job.updatedAt })
    .eq('id', job.id);
  if (error) throw new Error(`Failed to update generation job: ${error.message}`);
}

export async function updateClassroomGenerationJob(
  jobId: string,
  patch: Partial<ClassroomGenerationJob>,
): Promise<ClassroomGenerationJob> {
  const existing = await readClassroomGenerationJob(jobId);
  if (!existing) throw new Error(`Classroom generation job not found: ${jobId}`);
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await persistJob(updated);
  return updated;
}

export async function markClassroomGenerationJobRunning(
  jobId: string,
): Promise<ClassroomGenerationJob> {
  const existing = await readClassroomGenerationJob(jobId);
  if (!existing) throw new Error(`Classroom generation job not found: ${jobId}`);
  return updateClassroomGenerationJob(jobId, {
    status: 'running',
    startedAt: existing.startedAt || new Date().toISOString(),
    message: 'Classroom generation started',
  });
}
export async function updateClassroomGenerationJobProgress(
  jobId: string,
  progress: ClassroomGenerationProgress,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'running',
    step: progress.step,
    progress: progress.progress,
    message: progress.message,
    scenesGenerated: progress.scenesGenerated,
    totalScenes: progress.totalScenes,
  });
}
export async function markClassroomGenerationJobSucceeded(
  jobId: string,
  result: GenerateClassroomResult,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'succeeded',
    step: 'completed',
    progress: 100,
    message: 'Classroom generation completed',
    completedAt: new Date().toISOString(),
    scenesGenerated: result.scenesCount,
    result: { classroomId: result.id, url: result.url, scenesCount: result.scenesCount },
  });
}
export async function markClassroomGenerationJobFailed(
  jobId: string,
  error: string,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'failed',
    step: 'failed',
    message: 'Classroom generation failed',
    completedAt: new Date().toISOString(),
    error,
  });
}

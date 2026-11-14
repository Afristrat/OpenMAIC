import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { describeGenerationFailure } from '@/lib/generation/generation-tracking';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { nanoid } from 'nanoid';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { generateClassroomSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import { rejectIfInsufficientCredits } from '@/lib/server/credit-gate-response';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  createClassroomPlanJob,
  readClassroomPlanJob,
  type ClassroomPlanJob,
  markClassroomPlanJobFailed,
} from '@/lib/server/classroom-plan-job-store';
import { enqueueClassroomPlan } from '@/lib/jobs/queue';
import type { TTSProviderId } from '@/lib/audio/types';
import { FrameworkError } from '@/lib/referentiel/plan-framework';
import { requireCompetencyFramework } from '@/lib/server/plan-framework';
import {
  assertCourseGenerationAccess,
  CourseAccessError,
} from '@/lib/server/course-generation-access';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const orgId = z.string().uuid().safeParse(request.nextUrl.searchParams.get('orgId'));
  if (!orgId.success) return apiError('INVALID_REQUEST', 400, 'Invalid organization');
  const auth = await requireSuperAdminOrOrgAuthor(request, orgId.data);
  if (auth.response) return auth.response;

  const offset = Number(request.nextUrl.searchParams.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return apiError('INVALID_REQUEST', 400, 'Invalid offset');
  }
  const pageSize = 25;
  const { data, error } = await createServiceSupabaseClient()
    .from('classroom_generation_jobs')
    .select(
      'id,status,created_at,updated_at,title:payload->result->>courseTitle,requirement:payload->input->>requirement,error:payload->>error,approved:payload->>approvedAt',
    )
    .eq('owner_id', auth.user.id)
    .eq('org_id', orgId.data)
    .eq('payload->>kind', 'classroom-plan')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize);
  if (error) return apiError('INTERNAL_ERROR', 500, 'Failed to list classroom plans');

  const plans = (data ?? []).slice(0, pageSize);
  const { data: launches, error: launchError } = plans.length
    ? await createServiceSupabaseClient()
        .from('classroom_generation_jobs')
        .select('id,status,updated_at,planId:payload->>planJobId')
        .eq('owner_id', auth.user.id)
        .eq('org_id', orgId.data)
        .in(
          'payload->>planJobId',
          plans.map((plan) => plan.id),
        )
        .order('created_at', { ascending: false })
    : { data: [], error: null };
  if (launchError) return apiError('INTERNAL_ERROR', 500, 'Failed to list classroom launches');

  return apiSuccess({
    jobs: plans.map((plan) => {
      const launch = launches?.find((candidate) => candidate.planId === plan.id);
      const status = getPlanStatus(plan.status, plan.updated_at);
      return {
        id: plan.id,
        title: plan.title || plan.requirement?.slice(0, 160),
        createdAt: plan.created_at,
        status,
        approved: Boolean(plan.approved),
        failure:
          status === 'failed' ? describeGenerationFailure(plan.error ?? undefined) : undefined,
        launch: launch
          ? { id: launch.id, status: getPlanStatus(launch.status, launch.updated_at) }
          : undefined,
      };
    }),
    nextOffset: (data?.length ?? 0) > pageSize ? offset + pageSize : null,
  });
}

function getPlanStatus(status: string, updatedAt: string) {
  return ['queued', 'running'].includes(status) &&
    Date.now() - new Date(updatedAt).getTime() > 30 * 60 * 1000
    ? 'failed'
    : status;
}

export async function POST(request: NextRequest) {
  let jobId: string | undefined;
  try {
    const rawBody = await request.json().catch(() => null);
    let previous: ClassroomPlanJob | null = null;
    if (typeof rawBody?.retryJobId === 'string') {
      const auth = await requireSuperAdminOrOrgAuthor(request, rawBody.orgId ?? '');
      if (auth.response) return auth.response;
      previous = await readClassroomPlanJob(rawBody.retryJobId);
      if (!previous || previous.ownerId !== auth.user.id || previous.orgId !== rawBody.orgId) {
        return apiError('INVALID_REQUEST', 404, 'Classroom plan job not found');
      }
      if (getPlanStatus(previous.status, previous.updatedAt) !== 'failed' || !previous.input) {
        return apiError('INVALID_REQUEST', 409, 'Classroom plan cannot be retried');
      }
    }
    const validation = validateBody(
      generateClassroomSchema,
      previous ? { ...previous.input, modelString: rawBody.modelString } : rawBody,
    );
    if (!validation.success) return validation.response;
    const parsed = validation.data;
    const auth = await requireSuperAdminOrOrgAuthor(request, parsed.orgId);
    if (auth.response) return auth.response;
    await assertCourseGenerationAccess(parsed, auth.user.id);
    // Métier ESCO et compétences visées : exigés dès le plan, vérifiés contre le référentiel.
    await requireCompetencyFramework({
      courseId: parsed.courseId,
      framework: parsed.competencyFramework,
    });
    const creditRejection = await rejectIfInsufficientCredits(parsed.orgId);
    if (creditRejection) return creditRejection;

    const input: GenerateClassroomInput = {
      orgId: parsed.orgId,
      courseId: parsed.courseId,
      sourceManifestId: parsed.sourceManifestId,
      authorRole: auth.authoredByRole,
      requirement: parsed.requirement,
      language: parsed.language,
      modelString: parsed.modelString,
      learningApproach: parsed.learningApproach,
      interactionLevel: parsed.interactionLevel,
      learningContext: {
        territory: parsed.learningContext.territory,
        currencyCode: parsed.learningContext.currencyCode.toUpperCase(),
      },
      pdfContent: parsed.pdfContent,
      enableWebSearch: parsed.enableWebSearch,
      webSearchProviderId: parsed.webSearchProviderId,
      enableImageGeneration: parsed.enableImageGeneration,
      imageProviderId: parsed.imageProviderId,
      imageModelId: parsed.imageModelId,
      enableVideoGeneration: parsed.enableVideoGeneration,
      enableTTS: parsed.enableTTS,
      interactiveMode: parsed.interactiveMode,
      agentMode: parsed.agentMode,
      selectedPersonaIds: parsed.selectedPersonaIds,
      contextualSpecialists: parsed.contextualSpecialists?.map((specialist) => ({
        ...specialist,
        voiceConfig: {
          ...specialist.voiceConfig,
          providerId: specialist.voiceConfig.providerId as TTSProviderId,
        },
      })),
      teacherVoiceConfig: parsed.teacherVoiceConfig,
      agentVoiceOverrides: parsed.agentVoiceOverrides
        ? Object.fromEntries(
            Object.entries(parsed.agentVoiceOverrides).map(([agentId, voice]) => [
              agentId,
              { ...voice, providerId: voice.providerId as TTSProviderId },
            ]),
          )
        : undefined,
      activeSkillId: parsed.activeSkillId,
      ...(parsed.competencyFramework ? { competencyFramework: parsed.competencyFramework } : {}),
    };

    jobId = `plan-${nanoid(10)}`;
    const job = await createClassroomPlanJob(jobId, input, auth.user.id);
    try {
      await enqueueClassroomPlan({ jobId });
    } catch (error) {
      await markClassroomPlanJobFailed(
        jobId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    return apiSuccess(
      {
        jobId,
        status: job.status,
        pollUrl: `/api/generate-classroom/plan/${jobId}`,
        pollIntervalMs: 30_000,
      },
      202,
    );
  } catch (error) {
    if (error instanceof FrameworkError) {
      return apiError('INVALID_REQUEST', 422, error.message, error.code);
    }
    if (error instanceof CourseAccessError) return apiError('INVALID_REQUEST', 403, error.message);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom plan job',
      error instanceof Error ? error.message : String(error),
    );
  }
}

import { type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { rejectIfInsufficientCredits } from '@/lib/server/credit-gate-response';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  createClassroomGenerationJob,
  markClassroomGenerationJobFailed,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import {
  readClassroomPlanJob,
  saveApprovedClassroomPlan,
} from '@/lib/server/classroom-plan-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { generateClassroomSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/logger';
import type { TTSProviderId } from '@/lib/audio/types';
import { uncoveredRequiredEssentials } from '@/lib/referentiel/plan-coverage';
import { FrameworkError } from '@/lib/referentiel/plan-framework';
import { requireCompetencyFramework } from '@/lib/server/plan-framework';
import { enqueueClassroomGeneration } from '@/lib/jobs/queue';
import {
  assertCourseGenerationAccess,
  CourseAccessError,
  FreeCourseLimitError,
} from '@/lib/server/course-generation-access';

const log = createLogger('GenerateClassroom API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let requirementSnippet: string | undefined;
  try {
    const rawBody = await req.json().catch(() => null);
    const validation = validateBody(generateClassroomSchema, rawBody);
    if (!validation.success) return validation.response;

    const parsed = validation.data;
    requirementSnippet = parsed.requirement.substring(0, 60);

    const auth = await requireSuperAdminOrOrgAuthor(req, parsed.orgId);
    if (auth.response) return auth.response;
    await assertCourseGenerationAccess(parsed, auth.user.id);
    // Métier ESCO et compétences visées : exigés à la création, vérifiés contre le référentiel.
    const requiredFramework = await requireCompetencyFramework({
      courseId: parsed.courseId,
      framework: parsed.competencyFramework,
    });
    // Un plan validé n'est accepté que si chaque compétence essentielle est travaillée par une séquence.
    if (requiredFramework && parsed.approvedPlan) {
      const gaps = uncoveredRequiredEssentials(
        parsed.approvedPlan.outlines,
        parsed.approvedPlan.competencyFramework,
        requiredFramework,
      );
      if (gaps.length > 0) {
        return apiError(
          'INVALID_REQUEST',
          422,
          `Aucune séquence ne travaille encore : ${gaps.map((gap) => gap.title).join(' ; ')}. Rattachez chaque compétence essentielle à une séquence du programme.`,
          'COMPETENCY_COVERAGE_INCOMPLETE',
        );
      }
    }
    const creditRejection = await rejectIfInsufficientCredits(parsed.orgId);
    if (creditRejection) return creditRejection;

    const body: GenerateClassroomInput = {
      orgId: parsed.orgId,
      authorRole: auth.authoredByRole,
      learningApproach: parsed.learningApproach,
      interactionLevel: parsed.interactionLevel,
      learningContext: {
        territory: parsed.learningContext.territory,
        currencyCode: parsed.learningContext.currencyCode.toUpperCase(),
      },
      ...(parsed.courseId ? { courseId: parsed.courseId } : {}),
      ...(parsed.sourceManifestId ? { sourceManifestId: parsed.sourceManifestId } : {}),
      requirement: parsed.requirement,
      ...(parsed.pdfContent ? { pdfContent: parsed.pdfContent } : {}),
      ...(parsed.language ? { language: parsed.language } : {}),
      ...(parsed.modelString ? { modelString: parsed.modelString } : {}),
      ...(parsed.enableWebSearch != null ? { enableWebSearch: parsed.enableWebSearch } : {}),
      ...(parsed.webSearchProviderId ? { webSearchProviderId: parsed.webSearchProviderId } : {}),
      ...(parsed.webSearchApiKey ? { webSearchApiKey: parsed.webSearchApiKey } : {}),
      ...(parsed.baiduSubSources ? { baiduSubSources: parsed.baiduSubSources } : {}),
      ...(parsed.enableImageGeneration != null
        ? { enableImageGeneration: parsed.enableImageGeneration }
        : {}),
      ...(parsed.imageProviderId ? { imageProviderId: parsed.imageProviderId } : {}),
      ...(parsed.imageModelId ? { imageModelId: parsed.imageModelId } : {}),
      ...(parsed.enableVideoGeneration != null
        ? { enableVideoGeneration: parsed.enableVideoGeneration }
        : {}),
      ...(parsed.enableTTS != null ? { enableTTS: parsed.enableTTS } : {}),
      ...(parsed.interactiveMode != null ? { interactiveMode: parsed.interactiveMode } : {}),
      ...(parsed.agentMode ? { agentMode: parsed.agentMode } : {}),
      ...(parsed.selectedPersonaIds ? { selectedPersonaIds: parsed.selectedPersonaIds } : {}),
      ...(parsed.contextualSpecialists
        ? {
            contextualSpecialists: parsed.contextualSpecialists.map((specialist) => ({
              ...specialist,
              voiceConfig: {
                ...specialist.voiceConfig,
                providerId: specialist.voiceConfig.providerId as TTSProviderId,
              },
            })),
          }
        : {}),
      ...(parsed.teacherVoiceConfig ? { teacherVoiceConfig: parsed.teacherVoiceConfig } : {}),
      ...(parsed.agentVoiceOverrides
        ? {
            agentVoiceOverrides: Object.fromEntries(
              Object.entries(parsed.agentVoiceOverrides).map(([agentId, voice]) => [
                agentId,
                { ...voice, providerId: voice.providerId as TTSProviderId },
              ]),
            ),
          }
        : {}),
      ...(parsed.activeSkillId ? { activeSkillId: parsed.activeSkillId } : {}),
      ...(parsed.approvedPlan ? { approvedPlan: parsed.approvedPlan } : {}),
      ...(parsed.competencyFramework ? { competencyFramework: parsed.competencyFramework } : {}),
    };

    let jobId = nanoid(10);
    if (parsed.planJobId && parsed.approvedPlan) {
      const planJob = await readClassroomPlanJob(parsed.planJobId);
      if (
        !planJob ||
        planJob.ownerId !== auth.user.id ||
        planJob.orgId !== parsed.orgId ||
        planJob.status !== 'succeeded'
      ) {
        return apiError('INVALID_REQUEST', 404, 'Classroom plan job not found');
      }
      let attempt = planJob.id;
      for (;;) {
        jobId = createHash('sha256').update(`course:${attempt}`).digest('hex').slice(0, 32);
        const launch = await readClassroomGenerationJob(jobId);
        if (!launch) break;
        if (launch.status !== 'failed') return apiSuccess({ jobId, status: launch.status }, 202);
        attempt = jobId;
      }
      await saveApprovedClassroomPlan(planJob.id, parsed.approvedPlan);
    }

    const baseUrl = buildRequestOrigin(req);
    const planJobId = parsed.approvedPlan ? parsed.planJobId : undefined;
    const job = await createClassroomGenerationJob(jobId, body, auth.user.id, planJobId);
    if (!job) {
      const existing = await readClassroomGenerationJob(jobId);
      if (!existing) return apiError('INTERNAL_ERROR', 500, 'Missing classroom launch');
      return apiSuccess({ jobId, status: existing.status }, 202);
    }
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    try {
      await enqueueClassroomGeneration({ jobId, baseUrl, ownerId: auth.user.id });
    } catch (error) {
      await markClassroomGenerationJobFailed(
        jobId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    if (error instanceof FreeCourseLimitError)
      return apiError('QUOTA_EXCEEDED', 429, error.message);
    if (error instanceof FrameworkError) {
      return apiError('INVALID_REQUEST', 422, error.message, error.code);
    }
    if (error instanceof CourseAccessError) return apiError('INVALID_REQUEST', 403, error.message);
    log.error(
      `Classroom generation job creation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

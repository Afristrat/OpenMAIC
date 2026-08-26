import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { generateClassroomSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  createClassroomPlanJob,
  markClassroomPlanJobFailed,
} from '@/lib/server/classroom-plan-job-store';
import { enqueueClassroomPlan } from '@/lib/jobs/queue';
import type { TTSProviderId } from '@/lib/audio/types';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let jobId: string | undefined;
  try {
    const validation = validateBody(
      generateClassroomSchema,
      await request.json().catch(() => null),
    );
    if (!validation.success) return validation.response;
    const parsed = validation.data;
    const auth = await requireSuperAdminOrOrgAuthor(request, parsed.orgId);
    if (auth.response) return auth.response;

    const input: GenerateClassroomInput = {
      orgId: parsed.orgId,
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
      activeSkillId: parsed.activeSkillId,
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
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom plan job',
      error instanceof Error ? error.message : String(error),
    );
  }
}

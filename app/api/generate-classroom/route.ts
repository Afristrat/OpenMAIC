import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import {
  createClassroomGenerationJob,
  markClassroomGenerationJobFailed,
} from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { generateClassroomSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/logger';
import type { TTSProviderId } from '@/lib/audio/types';
import { enqueueClassroomGeneration } from '@/lib/jobs/queue';

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
      ...(parsed.activeSkillId ? { activeSkillId: parsed.activeSkillId } : {}),
      ...(parsed.approvedPlan ? { approvedPlan: parsed.approvedPlan } : {}),
    };

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body, auth.user.id);
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

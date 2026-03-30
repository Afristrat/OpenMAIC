import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { requireAuth } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { generateClassroomSchema } from '@/lib/api/schemas';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.response) return auth.response;

  try {
    const rawInput = await req.json();
    const validation = validateBody(generateClassroomSchema, rawInput);
    if (!validation.success) return validation.response;

    const body: GenerateClassroomInput = {
      requirement: validation.data.requirement,
      ...(validation.data.pdfContent ? { pdfContent: validation.data.pdfContent } : {}),
      ...(validation.data.language ? { language: validation.data.language } : {}),
      ...(validation.data.enableWebSearch != null ? { enableWebSearch: validation.data.enableWebSearch } : {}),
      ...(validation.data.enableImageGeneration != null
        ? { enableImageGeneration: validation.data.enableImageGeneration }
        : {}),
      ...(validation.data.enableVideoGeneration != null
        ? { enableVideoGeneration: validation.data.enableVideoGeneration }
        : {}),
      ...(validation.data.enableTTS != null ? { enableTTS: validation.data.enableTTS } : {}),
      ...(validation.data.agentMode ? { agentMode: validation.data.agentMode } : {}),
    };

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, body, baseUrl));

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
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

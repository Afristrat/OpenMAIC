import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { getSyllabusValidationIssues } from '@/lib/generation/syllabus-validation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { ClassroomPlan } from '@/lib/types/generation';

const log = createLogger('AssistSyllabus');

export const maxDuration = 90;

type AssistTarget = { kind: 'syllabus' } | { kind: 'scene'; sceneIndex: number };

function parseCompletePlan(text: string): ClassroomPlan | null {
  const parsed = parseJsonResponse<unknown>(text);
  const validated = approvedClassroomPlanSchema.safeParse(parsed);
  if (!validated.success) return null;
  if (getSyllabusValidationIssues(validated.data.syllabus, validated.data.outlines).length > 0) {
    return null;
  }
  return validated.data as ClassroomPlan;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const orgId = typeof body?.orgId === 'string' ? body.orgId.trim() : '';
    const learningApproach = body?.learningApproach;
    const interactionLevel = body?.interactionLevel;
    const target = body?.target as AssistTarget | undefined;
    const planValidation = approvedClassroomPlanSchema.safeParse(body?.plan);

    const validApproach = ['pedagogy', 'hybrid', 'andragogy'].includes(
      String(learningApproach),
    );
    const validInteraction = ['guided', 'balanced', 'immersive'].includes(
      String(interactionLevel),
    );
    const validTarget =
      target?.kind === 'syllabus' ||
      (target?.kind === 'scene' &&
        Number.isInteger(target.sceneIndex) &&
        target.sceneIndex >= 0 &&
        target.sceneIndex < (planValidation.success ? planValidation.data.outlines.length : 0));

    if (!orgId || !validApproach || !validInteraction || !validTarget || !planValidation.success) {
      return apiError('INVALID_REQUEST', 400, 'A valid plan and validated design choices are required');
    }

    const auth = await requireSuperAdminOrOrgAuthor(request, orgId);
    if (auth.response) return auth.response;

    const { model, thinkingConfig } = await resolveModelFromRequest(
      request,
      'generate-classroom',
    );
    const targetMarkup =
      target.kind === 'scene'
        ? `<target>scene</target>\n<target_scene_index>${target.sceneIndex}</target_scene_index>`
        : '<target>syllabus</target>';
    const locale = body?.locale === 'ar-MA' ? 'ar-MA' : body?.locale === 'en-US' ? 'en-US' : 'fr-FR';
    const prompt = `<locale>${locale}</locale>
<learning_approach>${learningApproach}</learning_approach>
<interaction_level>${interactionLevel}</interaction_level>
${targetMarkup}
<current_plan>${JSON.stringify(planValidation.data)}</current_plan>`;

    const response = await callLLM(
      {
        model,
        system: `You improve an editable Qalem training plan for its author.
The learning approach and interaction level are already validated decisions. They govern the plan and must not be changed or ignored.
Revise only the requested target. Preserve every explicit constraint, source requirement, learning resource, media request, scene identifier, scene type and all content outside the target.
Every scene must have a non-empty title, description, observable teachingObjective and estimatedDuration of at least 30 seconds. Keep the total timing coherent with totalDurationMinutes.
Use observable action verbs and measurable evidence. Do not add generic filler, chat language, fabricated facts, fake files or fake URLs. Never use em dashes.
Return only the complete plan as one valid JSON object with courseTitle, languageDirective, syllabus and outlines.`,
        prompt,
      },
      'assist-syllabus',
      { retries: 1, validate: (text) => parseCompletePlan(text) !== null },
      thinkingConfig,
    );
    const plan = parseCompletePlan(response.text);
    if (!plan) return apiError('PARSE_FAILED', 502, 'The assisted plan is incomplete');
    return apiSuccess({ plan });
  } catch (error) {
    log.error('Syllabus assistance failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Syllabus assistance failed',
    );
  }
}

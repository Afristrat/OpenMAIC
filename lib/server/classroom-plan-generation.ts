import { callLLM } from '@/lib/ai/llm';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { isFeatureEnabled } from '@/lib/flags';
import { buildLiveInstructionalDirective } from '@/lib/formation-engine/downstream-consumers';
import {
  buildLearningContextDirective,
  DEFAULT_LEARNING_CONTEXT,
  normalizeLearningContext,
} from '@/lib/formation-engine/learning-context';
import {
  extractRequestedSceneCount,
  generateSceneOutlinesFromRequirements,
  isSceneCountMismatch,
} from '@/lib/generation/outline-generator';
import { enforceExecutableObligations } from '@/lib/generation/executable-obligations';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { DEFAULT_LEARNING_DESIGN, learningDesignFromSettings } from '@/lib/agents/persona-catalog';
import { resolveModel } from '@/lib/server/resolve-model';
import { resolveOrganizationSkillId } from '@/lib/server/skill-resolution';
import { assertSourceMaterialAlignment } from '@/lib/server/source-material-alignment';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { normalizePdfImages } from '@/lib/server/pdf-source';

export async function generateClassroomPlan(input: GenerateClassroomInput) {
  const learningContext = normalizeLearningContext(
    input.learningContext ?? DEFAULT_LEARNING_CONTEXT,
  );
  const contextualRequirement = `${input.requirement}\n\n${buildLearningContextDirective(
    learningContext,
    input.language ?? 'fr-FR',
  )}`;

  let activeSkillId = input.activeSkillId;
  if (activeSkillId) activeSkillId = await resolveOrganizationSkillId(input.orgId, activeSkillId);

  let learningDesign = DEFAULT_LEARNING_DESIGN;
  try {
    const supabase = createServiceSupabaseClient();
    const { data: organization } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', input.orgId)
      .single();
    learningDesign = {
      ...learningDesignFromSettings(organization?.settings),
      interactionLevel: input.interactionLevel,
    };
  } catch {
    // The explicit author choices remain sufficient when tenant defaults are unavailable.
  }

  const instructionalDirective = buildLiveInstructionalDirective({
    approach: input.learningApproach,
    audienceStage: learningDesign.audienceStage,
    expertiseLevel: learningDesign.expertiseLevel,
    interactionLevel: input.interactionLevel,
  });
  const requirements = {
    requirement: `${contextualRequirement}\n\n${instructionalDirective}`,
    interactiveMode: input.interactiveMode ?? false,
    activeSkillId,
  };
  const resolved = await resolveModel(
    input.modelString ? { modelString: input.modelString } : { stage: 'generate-classroom' },
  );
  if (isProviderKeyRequired(resolved.providerId) && !resolved.apiKey) {
    throw new Error(`No API key configured for provider "${resolved.providerId}".`);
  }
  const aiCall: AICallFn = async (systemPrompt, userPrompt) => {
    const result = await callLLM(
      {
        model: resolved.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: resolved.modelInfo?.outputWindow,
      },
      'generate-classroom',
      undefined,
      resolved.thinkingConfig,
    );
    return result.text;
  };

  if (input.pdfContent?.text) {
    await assertSourceMaterialAlignment(input.requirement, input.pdfContent.text, aiCall);
  }

  const expectedSceneCount = extractRequestedSceneCount(input.requirement);
  const generationOptions = {
    imageGenerationEnabled: input.enableImageGeneration,
    videoGenerationEnabled: input.enableVideoGeneration,
    skillEngineEnabled: await isFeatureEnabled('skill_engine'),
    expectedSceneCount,
  };
  const generatePlan = (nextRequirements: typeof requirements) =>
    generateSceneOutlinesFromRequirements(
      nextRequirements,
      input.pdfContent?.text || undefined,
      normalizePdfImages(input.pdfContent),
      aiCall,
      undefined,
      generationOptions,
    );

  let result = await generatePlan(requirements);
  if (expectedSceneCount && isSceneCountMismatch(result.error)) {
    result = await generatePlan({
      ...requirements,
      requirement: `${requirements.requirement}\n\nAUTHORITATIVE CORRECTION: Return exactly ${expectedSceneCount} complete, semantically coherent scene outlines. Redesign the plan as needed. Do not truncate an existing plan.`,
    });
  }
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to generate classroom plan');
  }
  return enforceExecutableObligations(result.data, input.requirement);
}

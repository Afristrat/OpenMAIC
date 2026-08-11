import { nanoid } from 'nanoid';
import { callLLM } from '@/lib/ai/llm';
import { createStageAPI } from '@/lib/api/stage-api';
import type { StageStore } from '@/lib/api/stage-api-types';
import {
  applyOutlineFallbacks,
  extractRequestedSceneCount,
  generateSceneOutlinesFromRequirements,
  isSceneCountMismatch,
} from '@/lib/generation/outline-generator';
import {
  createSceneWithActions,
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { AgentInfo } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import { resolveClassroomWebSearchConfig } from '@/lib/server/web-search-config';
import { resolveModel } from '@/lib/server/resolve-model';
import { getStageModel } from '@/lib/server/model-routes';
import { resolveVocationalActive } from '@/lib/config/feature-flags';
import { buildSearchQuery } from '@/lib/server/search-query-builder';
import { formatSearchResultsAsContext, searchWeb } from '@/lib/web-search';
import { enrichSourcesWithCrawl4AI } from '@/lib/server/crawl4ai';
import type { BaiduSubSources, WebSearchProviderId } from '@/lib/web-search/types';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { persistGeneratedCourse, type CourseLocale } from '@/lib/server/course-storage';
import {
  generateMediaForClassroom,
  removeUnresolvedMediaPlaceholders,
  replaceMediaPlaceholders,
  generateTTSForClassroom,
} from '@/lib/server/classroom-media-generation';
import { withGenerationRetry } from '@/lib/generation/generation-retry';
import { buildVideoManifestFromOutlines } from '@/lib/media/video-manifest';
import { placeGeneratedMediaOnSlides } from '@/lib/generation/media-placement';
import { decideCaptureForScene } from '@/lib/generation/web-capture-plan';
import { requestWebCapture } from '@/lib/server/capture-client';
import type {
  ClassroomPlan,
  UserRequirements,
  PdfImage,
  ImageMapping,
  PdfSourceContent,
} from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';
import { isFeatureEnabled } from '@/lib/flags';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  DEFAULT_TEACHING_PROFILE,
  teachingProfileFromLearningDesign,
  teachingProfileFromSettings,
} from '@/lib/org/teaching-profile';
import {
  DEFAULT_LEARNING_DESIGN,
  buildTenantAgentConfigs,
  learningDesignFromSettings,
  type InteractionLevel,
  type LearningApproach,
  type LearningDesignSettings,
} from '@/lib/agents/persona-catalog';
import { selectTenantCast, type LearnerCastingProfile } from '@/lib/agents/cast-selection';
import { deriveCourseId, reserveDistinctCasting } from '@/lib/agents/casting-variation';
import { releaseCastingReservation, reserveCasting } from '@/lib/server/casting-storage';
import {
  buildContentCastPrompt,
  parseContentCastMechanisms,
} from '@/lib/agents/content-cast-director';
import { resolveOrganizationSkillId } from '@/lib/server/skill-resolution';
import { buildLiveInstructionalDirective } from '@/lib/formation-engine/downstream-consumers';
import { toPersistedResearchSources } from '@/lib/server/research-sources';
import { createAnimationConstitution } from '@/lib/formation-engine/animation-constitution';
import { generateResourcesForClassroom } from '@/lib/server/classroom-resource-generation';
import type { TTSProviderId } from '@/lib/audio/types';
import type { ContextualSpecialist } from '@/lib/agents/contextual-specialist';
import type { LearningContext } from '@/lib/types/stage';
import {
  buildLearningContextDirective,
  DEFAULT_LEARNING_CONTEXT,
  normalizeLearningContext,
} from '@/lib/formation-engine/learning-context';
import {
  organizationDesignSystemFromSettings,
  type OrganizationDesignSystem,
} from '@/lib/branding/organization-design-system';
import {
  normalizePdfImages,
  persistSelectedPdfImages,
  uploadedPdfSource,
} from '@/lib/server/pdf-source';
import { teacherProfileFromClassroomCast } from '@/lib/agents/classroom-casting';

const log = createLogger('Classroom');

export interface GenerateClassroomInput {
  orgId: string;
  authorRole: 'author' | 'super-admin';
  learningApproach: LearningApproach;
  interactionLevel: InteractionLevel;
  /** Required for new authoring requests; optional only to drain legacy queued jobs safely. */
  learningContext?: LearningContext;
  /** Persisted courses from S1-003 override the deterministic current-flow identity. */
  courseId?: string;
  language?: CourseLocale;
  requirement: string;
  pdfContent?: PdfSourceContent;
  enableWebSearch?: boolean;
  webSearchProviderId?: WebSearchProviderId;
  webSearchApiKey?: string;
  baiduSubSources?: BaiduSubSources;
  enableImageGeneration?: boolean;
  imageProviderId?: string;
  imageModelId?: string;
  enableVideoGeneration?: boolean;
  enableTTS?: boolean;
  interactiveMode?: boolean;
  agentMode?: 'default' | 'generate';
  selectedPersonaIds?: string[];
  contextualSpecialists?: ContextualSpecialist[];
  teacherVoiceConfig?: {
    providerId: string;
    modelId?: string;
    voiceId: string;
    voiceName?: string;
    gender?: 'female' | 'male' | 'neutral';
  };
  activeSkillId?: string;
  approvedPlan?: ClassroomPlan;
}

function applyTeacherVoiceConfig<
  T extends {
    name: string;
    role: string;
    avatar: string;
    gender?: 'female' | 'male';
    voiceConfig?: { providerId: TTSProviderId; modelId?: string; voiceId: string };
  },
>(agents: T[], config: GenerateClassroomInput['teacherVoiceConfig']): T[] {
  if (!config) return agents;
  return agents.map((agent) => {
    if (agent.role !== 'teacher') return agent;
    const gender =
      config.gender === 'female' || config.gender === 'male' ? config.gender : agent.gender;
    return {
      ...agent,
      ...(config.voiceName ? { name: config.voiceName } : {}),
      gender,
      avatar:
        gender === 'female'
          ? '/avatars/teacher-2.png'
          : gender === 'male'
            ? '/avatars/teacher.png'
            : agent.avatar,
      voiceConfig: {
        providerId: config.providerId as TTSProviderId,
        ...(config.modelId ? { modelId: config.modelId } : {}),
        voiceId: config.voiceId,
      },
    };
  });
}

export type ClassroomGenerationStep =
  | 'initializing'
  | 'researching'
  | 'generating_outlines'
  | 'generating_scenes'
  | 'generating_media'
  | 'generating_tts'
  | 'persisting'
  | 'completed';

export interface ClassroomGenerationProgress {
  step: ClassroomGenerationStep;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes?: number;
}

export interface GenerateClassroomResult {
  id: string;
  url: string;
  stage: Stage;
  scenes: Scene[];
  scenesCount: number;
  createdAt: string;
}

function createInMemoryStore(stage: Stage): StageStore {
  let state = {
    stage: stage as Stage | null,
    scenes: [] as Scene[],
    currentSceneId: null as string | null,
    mode: 'playback' as const,
  };

  const listeners: Array<(s: typeof state, prev: typeof state) => void> = [];

  return {
    getState: () => state,
    setState: (partial: Partial<typeof state>) => {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe: (listener: (s: typeof state, prev: typeof state) => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

const MAX_TARGET_PERFORMANCE_LENGTH = 2000;

export function resolveAnimationTargetPerformance(
  plan: ClassroomPlan,
  requirement: string,
): string {
  const candidate =
    plan.syllabus?.overallObjective?.trim() ||
    plan.outlines.find((outline) => outline.teachingObjective?.trim())?.teachingObjective?.trim() ||
    plan.courseTitle?.trim() ||
    requirement.trim() ||
    'Complete the expected learning performance.';

  if (candidate.length <= MAX_TARGET_PERFORMANCE_LENGTH) return candidate;
  return `${candidate.slice(0, MAX_TARGET_PERFORMANCE_LENGTH - 1).trimEnd()}…`;
}

export async function generateClassroom(
  input: GenerateClassroomInput,
  options: {
    baseUrl: string;
    ownerId: string;
    onProgress?: (progress: ClassroomGenerationProgress) => Promise<void> | void;
  },
): Promise<GenerateClassroomResult> {
  const { requirement, pdfContent } = input;
  const learningContext = normalizeLearningContext(
    input.learningContext ?? DEFAULT_LEARNING_CONTEXT,
  );
  const learningContextDirective = buildLearningContextDirective(
    learningContext,
    input.language ?? 'fr-FR',
  );
  const contextualRequirement = `${requirement}\n\n${learningContextDirective}`;
  let activeSkillId = input.activeSkillId;
  if (activeSkillId) {
    activeSkillId = await resolveOrganizationSkillId(input.orgId, activeSkillId);
  }
  let teachingProfile = DEFAULT_TEACHING_PROFILE;
  let learningDesign: LearningDesignSettings = DEFAULT_LEARNING_DESIGN;
  let learnerCastingProfile: LearnerCastingProfile = { culture: 'ma-fr', preferences: {} };
  let organizationDesignSystem: OrganizationDesignSystem | undefined;
  try {
    const supabase = createServiceSupabaseClient();
    const [{ data: organization }, { data: profile }] = await Promise.all([
      supabase.from('organizations').select('settings').eq('id', input.orgId).single(),
      supabase
        .from('user_profiles')
        .select('culture, preferences')
        .eq('user_id', options.ownerId)
        .maybeSingle(),
    ]);
    teachingProfile = teachingProfileFromSettings(organization?.settings);
    organizationDesignSystem = organizationDesignSystemFromSettings(organization?.settings);
    learningDesign = {
      ...learningDesignFromSettings(organization?.settings),
      interactionLevel: input.interactionLevel,
    };
    learnerCastingProfile = {
      culture: profile?.culture ?? learnerCastingProfile.culture,
      preferences: profile?.preferences ?? learnerCastingProfile.preferences,
    };
    teachingProfile = teachingProfileFromLearningDesign(learningDesign);
  } catch (error) {
    log.warn('Tenant learning design unavailable; using coherent defaults:', error);
  }

  await options.onProgress?.({
    step: 'initializing',
    progress: 5,
    message: 'Initializing classroom generation',
    scenesGenerated: 0,
  });

  const {
    model: languageModel,
    modelInfo,
    modelString,
    providerId,
    apiKey,
    thinkingConfig: classroomThinking,
  } = await resolveModel({ stage: 'generate-classroom' });
  log.info(`Using server-configured model: ${modelString}`);

  // Fail fast if the resolved provider has no API key configured
  if (isProviderKeyRequired(providerId) && !apiKey) {
    throw new Error(
      `No API key configured for provider "${providerId}". ` +
        `Set the appropriate key in .env.local or server-providers.yml (e.g. ${providerId.toUpperCase()}_API_KEY).`,
    );
  }

  // The web-search query rewrite is a light, separable stage operators may route
  // to a cheaper model. It defaults to the classroom model and is only
  // re-resolved lazily (inside the web-search branch, and only when a route is
  // configured). This keeps a misconfigured optional route from aborting all
  // classroom generation, and skips the extra resolution when web search is off.
  let searchQueryModel = languageModel;
  let searchQueryThinking = classroomThinking;

  const aiCall: AICallFn = async (systemPrompt, userPrompt, _images) => {
    const result = await callLLM(
      {
        model: languageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'generate-classroom',
      undefined,
      classroomThinking,
    );
    return result.text;
  };

  const sceneAiCall: AICallFn = async (systemPrompt, userPrompt, _images) => {
    const result = await callLLM(
      {
        model: languageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
        maxRetries: 0,
      },
      'generate-classroom-scene',
      undefined,
      classroomThinking,
    );
    return result.text;
  };

  const searchQueryAiCall: AICallFn = async (systemPrompt, userPrompt, _images) => {
    const result = await callLLM(
      {
        model: searchQueryModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: 256,
      },
      'web-search-query-rewrite',
      undefined,
      searchQueryThinking,
    );
    return result.text;
  };

  const instructionalDirective = buildLiveInstructionalDirective({
    approach: input.learningApproach,
    audienceStage: learningDesign.audienceStage,
    expertiseLevel: learningDesign.expertiseLevel,
    interactionLevel: input.interactionLevel,
  });
  const requirements: UserRequirements = {
    requirement: `${contextualRequirement}\n\n${instructionalDirective}`,
    interactiveMode: input.interactiveMode ?? false,
    activeSkillId,
  };
  const skillEngineEnabled = await isFeatureEnabled('skill_engine');
  const vocationalActive = resolveVocationalActive(requirements);
  const pdfText = pdfContent?.text || undefined;
  const pdfImages = normalizePdfImages(pdfContent);

  await options.onProgress?.({
    step: 'researching',
    progress: 10,
    message: 'Researching topic',
    scenesGenerated: 0,
  });

  // Web search (optional, graceful degradation)
  let researchContext: string | undefined;
  const uploadedSource = uploadedPdfSource(pdfContent);
  let researchSources: Stage['researchSources'] = uploadedSource ? [uploadedSource] : undefined;
  if (input.enableWebSearch) {
    const webSearchConfig = resolveClassroomWebSearchConfig(input);
    if (webSearchConfig) {
      // Re-resolve the query-rewrite model only when explicitly routed. If
      // resolution itself fails (e.g. unknown provider in the route), fall back
      // to the classroom model here; a route with a missing key resolves fine
      // and surfaces only later in callLLM, which the outer try/catch below
      // degrades gracefully — either way the pipeline still works.
      const rewriteRoute = getStageModel('web-search-query-rewrite');
      if (rewriteRoute) {
        try {
          const rewriteResolved = await resolveModel({ stage: 'web-search-query-rewrite' });
          searchQueryModel = rewriteResolved.model;
          searchQueryThinking = rewriteResolved.thinkingConfig;
        } catch (err) {
          log.warn(
            `web-search-query-rewrite route "${rewriteRoute}" unavailable; using classroom model for query rewrite`,
            err,
          );
        }
      }
      try {
        const searchQuery = await buildSearchQuery(
          contextualRequirement,
          pdfText,
          searchQueryAiCall,
        );

        log.info('Running web search for classroom generation', {
          hasPdfContext: searchQuery.hasPdfContext,
          rawRequirementLength: searchQuery.rawRequirementLength,
          rewriteAttempted: searchQuery.rewriteAttempted,
          finalQueryLength: searchQuery.finalQueryLength,
        });

        const searchResult = await searchWeb({
          providerId: webSearchConfig.providerId,
          query: searchQuery.query,
          apiKey: webSearchConfig.apiKey,
          baseUrl: webSearchConfig.baseUrl,
          baiduSubSources: webSearchConfig.baiduSubSources,
        });
        const enrichedSources = await enrichSourcesWithCrawl4AI(
          searchResult.sources,
          searchQuery.query,
        );
        const webSources = toPersistedResearchSources(enrichedSources);
        researchSources = uploadedSource ? [uploadedSource, ...webSources.slice(0, 7)] : webSources;
        researchContext = formatSearchResultsAsContext({
          ...searchResult,
          sources: enrichedSources,
        });
        if (researchContext) {
          log.info(`Web search returned ${enrichedSources.length} sources`);
        }
      } catch (e) {
        log.warn('Web search failed, continuing without search context:', e);
      }
    } else {
      log.warn('enableWebSearch is true but no web search API key configured, skipping web search');
    }
  }

  await options.onProgress?.({
    step: 'generating_outlines',
    progress: 15,
    message: 'Generating scene outlines',
    scenesGenerated: 0,
  });

  const expectedSceneCount = extractRequestedSceneCount(input.requirement);
  let outlinesResult = input.approvedPlan
    ? { success: true as const, data: input.approvedPlan }
    : await generateSceneOutlinesFromRequirements(
        requirements,
        pdfText,
        pdfImages,
        aiCall,
        undefined,
        {
          imageGenerationEnabled: input.enableImageGeneration,
          videoGenerationEnabled: input.enableVideoGeneration,
          researchContext,
          skillEngineEnabled,
          expectedSceneCount,
          // NO teacherContext — agents haven't been generated yet
        },
      );

  if (!input.approvedPlan && expectedSceneCount && isSceneCountMismatch(outlinesResult.error)) {
    outlinesResult = await generateSceneOutlinesFromRequirements(
      {
        ...requirements,
        requirement: `${requirements.requirement}\n\nAUTHORITATIVE CORRECTION: Return exactly ${expectedSceneCount} complete, semantically coherent scene outlines. Redesign the plan as needed. Do not truncate an existing plan.`,
      },
      pdfText,
      pdfImages,
      aiCall,
      undefined,
      {
        imageGenerationEnabled: input.enableImageGeneration,
        videoGenerationEnabled: input.enableVideoGeneration,
        researchContext,
        skillEngineEnabled,
        expectedSceneCount,
      },
    );
  }

  if (!outlinesResult.success || !outlinesResult.data) {
    log.error('Failed to generate outlines:', outlinesResult.error);
    throw new Error(outlinesResult.error || 'Failed to generate scene outlines');
  }

  if (expectedSceneCount && outlinesResult.data.outlines.length !== expectedSceneCount) {
    const actualSceneLabel = outlinesResult.data.outlines.length === 1 ? 'scene' : 'scenes';
    throw new Error(
      `The approved classroom plan contains ${outlinesResult.data.outlines.length} ${actualSceneLabel}, but the author explicitly requested ${expectedSceneCount}.`,
    );
  }

  const { languageDirective, courseTitle } = outlinesResult.data;
  const outlines = placeGeneratedMediaOnSlides(outlinesResult.data.outlines);
  log.info(
    `Generated ${outlines.length} scene outlines (languageDirective: ${languageDirective}, courseTitle: ${courseTitle ?? 'n/a'})`,
  );

  await options.onProgress?.({
    step: 'generating_outlines',
    progress: 30,
    message: `Generated ${outlines.length} scene outlines`,
    scenesGenerated: 0,
    totalScenes: outlines.length,
  });

  // Resolve agents based on agentMode — now AFTER outlines so we can use languageDirective
  let agents: AgentInfo[];
  const agentMode = input.agentMode || 'default';
  let preferredMechanismIds: string[] = [];
  if (agentMode === 'generate') {
    try {
      const contentCastModel = await resolveModel({ stage: 'agent-profiles' });
      if (isProviderKeyRequired(contentCastModel.providerId) && !contentCastModel.apiKey) {
        throw new Error(`No API key configured for provider "${contentCastModel.providerId}".`);
      }
      const selection = await callLLM(
        {
          model: contentCastModel.model,
          messages: [
            {
              role: 'system',
              content:
                'You select existing teaching mechanisms for a classroom. Obey the supplied roster exactly.',
            },
            {
              role: 'user',
              content: buildContentCastPrompt({
                courseTitle: courseTitle || requirement,
                outlines,
                personas: learningDesign.personas,
              }),
            },
          ],
          maxOutputTokens: Math.min(contentCastModel.modelInfo?.outputWindow ?? 128, 128),
        },
        'agent-profiles',
        undefined,
        contentCastModel.thinkingConfig,
      );
      preferredMechanismIds = parseContentCastMechanisms(
        selection.text,
        learningDesign.personas.filter((persona) => persona.enabled).map((persona) => persona.id),
      );
    } catch (error) {
      log.warn('Content-aware cast selection unavailable; using deterministic fallback:', error);
    }
  }
  let tenantAgentConfigs: ReturnType<typeof selectTenantCast>['agents'] = [];
  let castingReservationId: string | undefined;
  if (agentMode === 'generate') {
    const courseId = input.courseId ?? deriveCourseId(input.orgId, requirement);
    const reservation = await reserveDistinctCasting({
      draw: () =>
        selectTenantCast({
          design: learningDesign,
          profile: learnerCastingProfile,
          content: `${requirement}\n${JSON.stringify(outlines)}`,
          seed: nanoid(10),
          preferredMechanismIds,
        }).agents,
      reserve: (agents, lineupHash) =>
        reserveCasting({
          userId: options.ownerId,
          courseId,
          lineup: agents.map((agent) => ({ ...agent })),
          lineupHash,
        }),
    });
    tenantAgentConfigs = reservation.agents;
    castingReservationId = reservation.reservation?.id;
    if (reservation.reused) {
      log.info('All distinct castings were already used; reusing a valid lineup.');
    }
  }
  tenantAgentConfigs = applyTeacherVoiceConfig(tenantAgentConfigs, input.teacherVoiceConfig);
  if (input.contextualSpecialists?.length) {
    tenantAgentConfigs = [
      ...tenantAgentConfigs,
      ...input.contextualSpecialists.map((specialist) => ({
        id: specialist.id,
        name: specialist.name,
        role: specialist.role,
        persona: specialist.persona,
        avatar: specialist.avatar,
        color: '#7c3aed',
        priority: 7,
        interactionWeight: 6,
        mechanismId: `isco-${specialist.iscoCode}`,
        gender: specialist.gender,
        voiceConfig: specialist.voiceConfig,
        occupationalProfile: specialist.occupationalProfile,
      })),
    ];
  }
  if (agentMode === 'generate') {
    agents = tenantAgentConfigs.map(({ id, name, role, persona }) => ({
      id,
      name,
      role,
      persona,
    }));
    log.info(`Instantiated ${agents.length} tenant pedagogical personas`);
  } else {
    const selectedIds = new Set(input.selectedPersonaIds ?? []);
    const tenantRoster = applyTeacherVoiceConfig(
      buildTenantAgentConfigs(learningDesign),
      input.teacherVoiceConfig,
    );
    const contextualAgents = (input.contextualSpecialists ?? []).map((specialist) => ({
      id: specialist.id,
      name: specialist.name,
      role: specialist.role,
      persona: specialist.persona,
      avatar: specialist.avatar,
      color: '#7c3aed',
      priority: 7,
      interactionWeight: 6,
      mechanismId: `isco-${specialist.iscoCode}`,
      gender: specialist.gender,
      voiceConfig: specialist.voiceConfig,
      occupationalProfile: specialist.occupationalProfile,
    }));
    tenantRoster.push(...contextualAgents);
    const contextualAgentIds = new Set(contextualAgents.map((agent) => agent.id));
    const selectedRoster = tenantRoster.filter(
      (agent) =>
        agent.role === 'teacher' ||
        contextualAgentIds.has(agent.id) ||
        selectedIds.has(agent.mechanismId ?? agent.id),
    );
    tenantAgentConfigs = selectedRoster.length > 1 ? selectedRoster : tenantRoster.slice(0, 4);
    agents = tenantAgentConfigs.map(({ id, name, role, persona }) => ({ id, name, role, persona }));
  }
  teachingProfile = teacherProfileFromClassroomCast(tenantAgentConfigs);
  try {
    const stageId = nanoid(10);
    const stage: Stage = {
      id: stageId,
      name: courseTitle || outlines[0]?.title || requirement.slice(0, 50),
      description: undefined,
      languageDirective,
      learningContext,
      skillPromptContext: {
        enabled: skillEngineEnabled,
        activeSkillId: skillEngineEnabled ? activeSkillId : undefined,
      },
      ...(researchSources?.length ? { researchSources } : {}),
      videoManifest: buildVideoManifestFromOutlines(outlines),
      style: 'interactive',
      interactiveMode: input.interactiveMode ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      teacherProfile: teachingProfile,
      // For LLM-generated agents, embed full configs so the client can
      // hydrate the agent registry without prior IndexedDB data.
      // For default agents, just record IDs — the client already has them.
      generatedAgentConfigs: tenantAgentConfigs,
    };

    const selectedPdfImageIds = new Set(
      outlines.flatMap((outline) => outline.suggestedImageIds ?? []),
    );
    const persistedPdfImageMapping = await persistSelectedPdfImages(
      stageId,
      pdfImages,
      selectedPdfImageIds,
    );

    const store = createInMemoryStore(stage);
    const api = createStageAPI(store);

    log.info('Stage 2: Generating scene content and actions...');
    let generatedScenes = 0;
    let previousSceneSpeeches: string[] = [];

    const requestedResourceCount = outlines.reduce(
      (count, outline) => count + (outline.resourceGenerations?.length ?? 0),
      0,
    );
    if (requestedResourceCount > 0) {
      const generatedResourceCount = await generateResourcesForClassroom(
        outlines,
        stageId,
        options.baseUrl,
        languageDirective,
        sceneAiCall,
      );
      if (generatedResourceCount !== requestedResourceCount) {
        throw new Error(
          `Resource persistence incomplete: ${generatedResourceCount}/${requestedResourceCount} files generated`,
        );
      }
    }

    for (const [index, outline] of outlines.entries()) {
      const safeOutline = applyOutlineFallbacks(outline, true, {
        allowProceduralSkill: vocationalActive,
      });
      const progressStart = 30 + Math.floor((index / Math.max(outlines.length, 1)) * 60);

      await options.onProgress?.({
        step: 'generating_scenes',
        progress: Math.max(progressStart, 31),
        message: `Generating scene ${index + 1}/${outlines.length}: ${safeOutline.title}`,
        scenesGenerated: generatedScenes,
        totalScenes: outlines.length,
      });

      const reportSceneRetry = async (
        phase: 'content' | 'actions',
        event: { attempt: number; maxAttempts: number; reason: string },
      ) => {
        const nextAttempt = Math.min(event.attempt + 1, event.maxAttempts);
        const message = `Retrying scene ${index + 1}/${outlines.length} ${phase} (${nextAttempt}/${event.maxAttempts}): ${safeOutline.title}`;
        log.warn(`${message} — ${event.reason}`);
        await options.onProgress?.({
          step: 'generating_scenes',
          progress: Math.max(progressStart, 31),
          message,
          scenesGenerated: generatedScenes,
          totalScenes: outlines.length,
        });
      };

      // Web capture: decide + fetch an illustrative capture for this scene, if
      // any. Never blocks: any failure at any point here falls through with no
      // image (decideCaptureForScene/requestWebCapture never throw).
      let assignedImages: PdfImage[] | undefined;
      let imageMapping: ImageMapping | undefined;
      const sourceImageIds = new Set(safeOutline.suggestedImageIds ?? []);
      const sourceImages = pdfImages.filter((image) => sourceImageIds.has(image.id));
      if (sourceImages.length > 0) {
        assignedImages = sourceImages.map((image) => ({
          ...image,
          src: persistedPdfImageMapping[image.id] ?? image.src,
        }));
        imageMapping = Object.fromEntries(
          sourceImages
            .filter((image) => persistedPdfImageMapping[image.id])
            .map((image) => [image.id, persistedPdfImageMapping[image.id]]),
        );
      }
      if (safeOutline.generatedResources?.length) {
        assignedImages = [
          ...(assignedImages ?? []),
          ...safeOutline.generatedResources.map((resource) => ({
            id: `qr_${resource.id}`,
            src: resource.qrImageUrl,
            pageNumber: 0,
            width: 320,
            height: 320,
            description: `QR code for downloading ${resource.title}`,
          })),
        ];
        imageMapping = {
          ...(imageMapping ?? {}),
          ...Object.fromEntries(
            safeOutline.generatedResources.map((resource) => [
              `qr_${resource.id}`,
              resource.qrImageUrl,
            ]),
          ),
        };
      }
      const captureDecision = await decideCaptureForScene(
        safeOutline,
        sceneAiCall,
        languageDirective,
      );
      if (captureDecision?.needsCapture) {
        const asset = await requestWebCapture(captureDecision, stageId);
        if (asset && asset.format === 'image') {
          const imgId = 'img_capture_1';
          assignedImages = [
            ...(assignedImages ?? []),
            {
              id: imgId,
              src: asset.assetUrl,
              pageNumber: 0,
              description: captureDecision.reason,
            },
          ];
          imageMapping = { ...(imageMapping ?? {}), [imgId]: asset.assetUrl };
        }
        // asset.format === 'video' handled by the existing Hyperframes video
        // channel — out of scope here, tracked separately if/when a
        // capture-decision actually returns format:'video' in practice.
      }

      let sceneValidationDirective: string | undefined;
      const content = await withGenerationRetry(
        () =>
          generateSceneContent(safeOutline, sceneAiCall, {
            agents,
            languageDirective,
            languageModel,
            thinkingConfig: classroomThinking,
            userRequirements: requirements,
            courseOutlines: outlines,
            allowProceduralSkill: vocationalActive,
            skillEngineEnabled,
            activeSkillId: requirements.activeSkillId,
            assignedImages,
            imageMapping,
            requiredSourceImageIds:
              safeOutline.type === 'slide' ? sourceImages.map((image) => image.id) : undefined,
            validationDirective: sceneValidationDirective,
            onValidationFailure: (directive) => {
              sceneValidationDirective = directive;
            },
          }),
        {
          label: `scene ${index + 1}/${outlines.length} content`,
          shouldRetryResult: (result) => result === null,
          onRetry: (event) => reportSceneRetry('content', event),
        },
      );
      if (!content) {
        throw new Error(`Required scene generation failed: ${safeOutline.title}`);
      }

      const actions = await withGenerationRetry(
        () =>
          generateSceneActions(safeOutline, content, sceneAiCall, {
            ctx: {
              pageIndex: index + 1,
              totalPages: outlines.length,
              allTitles: outlines.map((item) => item.title),
              previousSpeeches: previousSceneSpeeches,
            },
            agents,
            requiredAgentIds: tenantAgentConfigs
              .filter(
                (agent, agentIndex) =>
                  agent.role !== 'teacher' && agentIndex % outlines.length === index,
              )
              .map((agent) => agent.id),
            languageDirective,
          }),
        {
          label: `scene ${index + 1}/${outlines.length} actions`,
          onRetry: (event) => reportSceneRetry('actions', event),
        },
      );
      log.info(`Scene "${safeOutline.title}": ${actions.length} actions`);

      previousSceneSpeeches = actions.flatMap((action) =>
        action.type === 'speech' ? [action.text] : [],
      );

      const sceneId = createSceneWithActions(safeOutline, content, actions, api);
      if (!sceneId) {
        throw new Error(`Required scene creation failed: ${safeOutline.title}`);
      }

      generatedScenes += 1;
      const progressEnd = 30 + Math.floor(((index + 1) / Math.max(outlines.length, 1)) * 60);
      await options.onProgress?.({
        step: 'generating_scenes',
        progress: Math.min(progressEnd, 90),
        message: `Generated ${generatedScenes}/${outlines.length} scenes`,
        scenesGenerated: generatedScenes,
        totalScenes: outlines.length,
      });
    }

    const scenes = store.getState().scenes;
    log.info(`Pipeline complete: ${scenes.length} scenes generated`);

    if (generatedScenes !== outlines.length || scenes.length !== outlines.length) {
      throw new Error(
        `Scene persistence incomplete: ${scenes.length}/${outlines.length} required scenes generated`,
      );
    }

    const speakingAgentIds = new Set(
      scenes.flatMap((scene) =>
        (scene.actions ?? []).flatMap((action) =>
          action.type === 'speech' && action.agentId ? [action.agentId] : [],
        ),
      ),
    );
    const silentAgents = tenantAgentConfigs.filter((agent) => !speakingAgentIds.has(agent.id));
    if (silentAgents.length > 0) {
      throw new Error(
        `Active classroom agents have no persisted speech: ${silentAgents
          .map((agent) => agent.id)
          .join(', ')}`,
      );
    }

    const animationConstitution = createAnimationConstitution({
      classroomId: stageId,
      organizationId: input.orgId,
      authorUserId: options.ownerId,
      authorRole: input.authorRole,
      approach: input.learningApproach,
      interactionLevel: input.interactionLevel,
      targetPerformance: resolveAnimationTargetPerformance(outlinesResult.data, requirement),
      scenes,
      agents: tenantAgentConfigs,
    });

    // Phase: Media generation (after all scenes generated)
    if (input.enableImageGeneration || input.enableVideoGeneration) {
      await options.onProgress?.({
        step: 'generating_media',
        progress: 90,
        message: 'Generating media files',
        scenesGenerated: scenes.length,
        totalScenes: outlines.length,
      });

      const mediaMap = await generateMediaForClassroom(
        outlines,
        stageId,
        organizationDesignSystem,
        {
          ...(input.imageProviderId ? { providerId: input.imageProviderId } : {}),
          ...(input.imageModelId ? { modelId: input.imageModelId } : {}),
        },
      );
      const requestedMediaIds = new Set(
        outlines.flatMap((outline) =>
          (outline.mediaGenerations ?? [])
            .filter(
              (request) =>
                (request.type === 'image' && input.enableImageGeneration) ||
                (request.type === 'video' && input.enableVideoGeneration),
            )
            .map((request) => request.elementId),
        ),
      );
      const generatedMediaCount = [...requestedMediaIds].filter((id) => mediaMap[id]).length;
      if (generatedMediaCount !== requestedMediaIds.size) {
        const unresolvedMediaIds = new Set([...requestedMediaIds].filter((id) => !mediaMap[id]));
        removeUnresolvedMediaPlaceholders(scenes, unresolvedMediaIds);
        log.warn(
          `Optional media unavailable: ${generatedMediaCount}/${requestedMediaIds.size} files generated; unresolved placeholders removed.`,
        );
      }
      replaceMediaPlaceholders(scenes, mediaMap);
      const serializedScenes = JSON.stringify(scenes);
      const unreferencedMediaIds = [...requestedMediaIds].filter(
        (id) => mediaMap[id] && !serializedScenes.includes(mediaMap[id]),
      );
      if (unreferencedMediaIds.length > 0) {
        throw new Error(`Media integration incomplete: ${unreferencedMediaIds.join(', ')}`);
      }
      log.info(`Media generation complete: ${generatedMediaCount} files`);
    }

    // Phase: TTS generation
    if (input.enableTTS) {
      await options.onProgress?.({
        step: 'generating_tts',
        progress: 90,
        message: 'Generating TTS audio',
        scenesGenerated: scenes.length,
        totalScenes: outlines.length,
      });

      const ttsReport = await generateTTSForClassroom(
        scenes,
        stageId,
        teachingProfile,
        tenantAgentConfigs,
        async ({ completed, total }) => {
          await options.onProgress?.({
            step: 'generating_tts',
            progress: total > 0 ? 90 + Math.floor((completed / total) * 8) : 98,
            message: `Generating TTS audio (${completed}/${total})`,
            scenesGenerated: scenes.length,
            totalScenes: outlines.length,
          });
        },
      );
      if (ttsReport.generated !== ttsReport.requested) {
        throw new Error(
          `TTS persistence incomplete: ${ttsReport.generated}/${ttsReport.requested} speech actions generated`,
        );
      }
      log.info(`TTS generation complete: ${ttsReport.generated}/${ttsReport.requested} files`);
    }

    await options.onProgress?.({
      step: 'persisting',
      progress: 98,
      message: 'Persisting classroom data',
      scenesGenerated: scenes.length,
      totalScenes: outlines.length,
    });

    const persisted = await persistClassroom(
      {
        id: stageId,
        stage,
        scenes,
        ownerId: options.ownerId,
        orgId: input.orgId,
        animationConstitution,
      },
      options.baseUrl,
    );
    await persistGeneratedCourse({
      courseId: input.courseId,
      ownerId: options.ownerId,
      orgId: input.orgId,
      stageId,
      title: stage.name,
      language: input.language ?? 'fr-FR',
      outlines,
    });

    log.info(`Classroom persisted: ${persisted.id}, URL: ${persisted.url}`);

    await options.onProgress?.({
      step: 'completed',
      progress: 100,
      message: 'Classroom generation completed',
      scenesGenerated: scenes.length,
      totalScenes: outlines.length,
    });

    return {
      id: persisted.id,
      url: persisted.url,
      stage,
      scenes,
      scenesCount: scenes.length,
      createdAt: persisted.createdAt,
    };
  } catch (error) {
    if (castingReservationId) {
      try {
        await releaseCastingReservation(castingReservationId);
      } catch (releaseError) {
        log.error('Failed to release an unfinished casting reservation:', releaseError);
      }
    }
    throw error;
  }
}

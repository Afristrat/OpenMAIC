/**
 * Stage 2: Scene content and action generation.
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedPluginContent,
  UserRequirements,
  PdfImage,
  ImageMapping,
  WidgetOutline,
  GeneratedLearningResource,
} from '@/lib/types/generation';
import type { WidgetType, WidgetConfig } from '@/lib/types/widgets';
import type { PromptId } from '@/lib/prompts/types';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import { generatePBLV2Project, PlannerV2Error } from '@/lib/pbl/v2/agents/planner';
import { generatePBLV2ProjectSingleCall } from '@/lib/pbl/v2/agents/planner-single-call';
import { projectV2ToLegacyProjectConfig } from '@/lib/pbl/v2/compat';
import type { PBLPlannerV2Input, PBLProjectV2 } from '@/lib/pbl/v2/types';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { buildPromptWithSkill } from '@/lib/skills/prompt-overrides';
import { DEFAULT_LANGUAGE_DIRECTIVE } from './outline-generator';
import { postProcessInteractiveHtml } from './interactive-post-processor';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import { loadPlugins } from '@/lib/plugins/loader';
import { validatePluginData } from '@/lib/plugins/schema-validator';
import {
  buildCourseContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@openmaic/dsl';
import type { QuizQuestion } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import { INTERVENTION_FORMS } from '@/lib/formation-engine/animation-constitution';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import type { ThinkingConfig } from '@/lib/types/provider';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

const INTERACTIVE_WIDGET_ACTIONS = [
  'widget_highlight',
  'widget_setState',
  'widget_annotation',
  'widget_reveal',
];

// ── Options interfaces for scene generation functions ──

export interface SceneContentOptions {
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  /** Source image IDs selected by the approved outline that the slide must actually place. */
  requiredSourceImageIds?: string[];
  languageModel?: LanguageModel;
  visionEnabled?: boolean;
  generatedMediaMapping?: ImageMapping;
  agents?: AgentInfo[];
  languageDirective?: string;
  thinkingConfig?: ThinkingConfig;
  /** Authoritative UI locale selected by the user, consumed by the PBL v2 planner. */
  targetLanguage?: string;
  /** Original course request/profile, used by PBL v2 for explicit learner-level signals. */
  userRequirements?: UserRequirements;
  /** Full generated course context, including resources delivered before a PBL scene. */
  courseOutlines?: SceneOutline[];
  allowProceduralSkill?: boolean;
  /**
   * Natural-language edit instruction for whole-slide regeneration (MAIC Editor
   * agent `regenerate_scene`). When set, the slide content prompt switches to
   * EDIT MODE. slide-only; ignored by other scene types.
   */
  editDirective?: string;
  /**
   * The current slide content, fed as the edit baseline so content-specific
   * instructions operate on the real slide rather than re-rolling from outline.
   * Only consumed by the slide branch alongside `editDirective`.
   */
  baselineContent?: GeneratedSlideContent;
  /** Exact validation feedback from the previous attempt, fed back to the model on retry. */
  validationDirective?: string;
  /** Reports a retryable validation failure to the orchestration retry loop. */
  onValidationFailure?: (directive: string) => void;
  skillEngineEnabled?: boolean;
  activeSkillId?: string;
}

export interface SceneActionsOptions {
  ctx?: SceneGenerationContext;
  agents?: AgentInfo[];
  /** Agents that must contribute a prepared intervention in this scene. */
  requiredAgentIds?: string[];
  userProfile?: string;
  languageDirective?: string;
}

// ==================== Stage 2: Full Scenes (Two-Step) ====================

/**
 * Stage 3: Generate full scenes (parallel version)
 *
 * Two steps:
 * - Step 3.1: Outline -> Page content (slide/quiz)
 * - Step 3.2: Content + script -> Action list
 *
 * All scenes generated in parallel using Promise.all
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  languageDirective?: string,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  const totalScenes = sceneOutlines.length;
  let completedCount = 0;

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  // Generate all scenes in parallel
  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      try {
        const sceneId = await generateSingleScene(outline, api, aiCall, languageDirective);

        // Update progress (not atomic, but sufficient for UI display)
        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        return { success: true, sceneId, index };
      } catch (error) {
        completedCount++;
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return { success: false, sceneId: null, index };
      }
    }),
  );

  // Collect successful sceneIds in original order
  const sceneIds = results
    .filter(
      (r): r is { success: true; sceneId: string; index: number } =>
        r.success && r.sceneId !== null,
    )
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}

/**
 * Generate a single scene (two-step process)
 *
 * Step 3.1: Generate content
 * Step 3.2: Generate Actions
 */
async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<string | null> {
  // Step 3.1: Generate content
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall, { languageDirective });
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // Step 3.2: Generate Actions
  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall, { languageDirective });
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // Create complete Scene
  return createSceneWithActions(outline, content, actions, api);
}

// ==================== Backward Compatibility Helpers ====================

/**
 * Convert legacy interactiveConfig to unified widget fields
 * For backward compatibility with old classrooms
 */
function convertInteractiveConfigToWidget(outline: SceneOutline): SceneOutline {
  const config = outline.interactiveConfig;
  if (!config) {
    log.warn(
      `Interactive outline missing both widget and interactiveConfig, falling back to simulation`,
    );
    return {
      ...outline,
      widgetType: 'simulation' as WidgetType,
      widgetOutline: { concept: outline.title },
    };
  }

  const widgetType = inferWidgetType(
    config.subject || '',
    config.conceptName,
    config.designIdea || '',
  );

  log.info(`Converting interactiveConfig to widget: ${widgetType} for "${outline.title}"`);

  return {
    ...outline,
    widgetType,
    widgetOutline: buildWidgetOutline(widgetType, config),
  };
}

/**
 * Infer widget type from concept characteristics
 */
function inferWidgetType(subject: string, concept: string, designIdea: string): WidgetType {
  const text = (subject + ' ' + concept + ' ' + designIdea).toLowerCase();

  // Rule-based inference
  if (
    /physics|chemistry|力学|化学|运动|反应|force|motion|equilibrium|wave|电路|circuit/.test(text)
  ) {
    return 'simulation';
  }
  if (/programming|code|algorithm|编程|算法|python|javascript|function|代码/.test(text)) {
    return 'code';
  }
  if (/process|workflow|步骤|流程|逻辑|step|flow|系统|system/.test(text)) {
    return 'diagram';
  }
  if (
    /biology|anatomy|cell|molecular|生物|细胞|分子|3d|三维|solar|planet|skeleton|organ/.test(text)
  ) {
    return 'visualization3d';
  }
  if (/game|quiz|practice|练习|游戏|puzzle|match|challenge|挑战/.test(text)) {
    return 'game';
  }

  // Default fallback
  return 'simulation';
}

/**
 * Build widgetOutline from interactiveConfig for backward compatibility
 */
function buildWidgetOutline(
  widgetType: WidgetType,
  config: { conceptName: string; conceptOverview: string; designIdea: string },
): WidgetOutline {
  const base: WidgetOutline = { concept: config.conceptName };

  switch (widgetType) {
    case 'simulation':
      // Try to extract variables from designIdea
      const varMatch = config.designIdea.match(/variables|参数|调整|adjust|slider/i);
      return { ...base, keyVariables: varMatch ? [] : undefined };
    case 'diagram':
      return { ...base, diagramType: 'flowchart' };
    case 'code':
      return { ...base, language: 'python' };
    case 'game':
      return { ...base, gameType: 'quiz' };
    case 'visualization3d':
      return { ...base, visualizationType: 'custom', objects: [] };
    default:
      return base;
  }
}

/**
 * Step 3.1: Generate content based on outline
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: SceneContentOptions = {},
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | GeneratedPluginContent
  | null
> {
  const {
    assignedImages,
    imageMapping,
    requiredSourceImageIds,
    languageModel,
    visionEnabled,
    generatedMediaMapping,
    agents,
    languageDirective,
    thinkingConfig,
    targetLanguage,
    userRequirements,
    courseOutlines,
    allowProceduralSkill = false,
    editDirective,
    baselineContent,
    validationDirective,
    onValidationFailure,
    skillEngineEnabled,
    activeSkillId,
  } = options;

  // Unified path for interactive scenes (both normal and ultra mode)
  if (outline.type === 'interactive') {
    // Backward compatibility: convert legacy interactiveConfig
    if (!outline.widgetType && outline.interactiveConfig) {
      log.info(`Converting legacy interactiveConfig for: ${outline.title}`);
      outline = convertInteractiveConfigToWidget(outline);
    }

    // If still no widgetType after conversion, fallback to simulation
    if (!outline.widgetType) {
      log.warn(
        `Interactive outline "${outline.title}" has no widgetType, falling back to simulation`,
      );
      outline = {
        ...outline,
        widgetType: 'simulation' as WidgetType,
        widgetOutline: { concept: outline.title },
      };
    }

    // Route to widget generation (handles all 5 types)
    return generateWidgetContent(outline, aiCall, languageDirective, { allowProceduralSkill });
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        requiredSourceImageIds,
        visionEnabled,
        generatedMediaMapping,
        agents,
        languageDirective,
        editDirective,
        baselineContent,
        validationDirective,
        onValidationFailure,
        skillEngineEnabled,
        activeSkillId,
      );
    case 'quiz':
      return generateQuizContent(
        outline,
        aiCall,
        languageDirective,
        userRequirements,
        courseOutlines,
        validationDirective,
        onValidationFailure,
        skillEngineEnabled,
        activeSkillId,
      );
    case 'pbl':
      return generatePBLSceneContent(
        outline,
        languageModel,
        languageDirective,
        thinkingConfig,
        targetLanguage,
        userRequirements,
        courseOutlines,
      );
    case 'plugin':
      return generatePluginContent(outline, aiCall, languageDirective);
    default:
      return null;
  }
}

async function generatePluginContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<GeneratedPluginContent | null> {
  const pluginType = outline.pluginType?.trim();
  if (!pluginType) {
    log.error(`Plugin outline "${outline.title}" has no pluginType`);
    return null;
  }

  const plugin = loadPlugins().find(
    (candidate) => candidate.type === pluginType || candidate.id === pluginType,
  );
  if (!plugin) {
    log.error(`Plugin "${pluginType}" is not registered`);
    return null;
  }

  const response = await aiCall(
    plugin.systemPrompt || 'Generate valid JSON data for this educational scene plug-in.',
    [
      `Scene title: ${outline.title}`,
      `Teaching purpose: ${outline.description}`,
      `Key points: ${(outline.keyPoints ?? []).join('; ')}`,
      languageDirective ? `Language directive: ${languageDirective}` : '',
      'Return only one JSON object that conforms exactly to this JSON Schema:',
      JSON.stringify(plugin.outputSchema, null, 2),
    ]
      .filter(Boolean)
      .join('\n\n'),
  );
  const data = parseJsonResponse<unknown>(response);
  const validation = validatePluginData(data, plugin.outputSchema);
  if (!validation.valid || typeof data !== 'object' || data === null || Array.isArray(data)) {
    log.error(
      `Generated data for plugin "${plugin.type}" is invalid: ${validation.error ?? 'root must be an object'}`,
    );
    return null;
  }

  const normalizedData = normalizePluginDataForOutline(
    plugin.type,
    data as Record<string, unknown>,
    outline,
  );

  return { pluginType: plugin.type, data: normalizedData };
}

function normalizePluginDataForOutline(
  pluginType: string,
  data: Record<string, unknown>,
  outline: SceneOutline,
): Record<string, unknown> {
  if (pluginType !== 'cash-flow-simulator' || !/13\s+semaines?/iu.test(outlineText(outline))) {
    return data;
  }

  const assumptions = data.assumptions;
  const labels = data.labels;
  if (
    !assumptions ||
    typeof assumptions !== 'object' ||
    Array.isArray(assumptions) ||
    !labels ||
    typeof labels !== 'object' ||
    Array.isArray(labels)
  ) {
    return data;
  }

  const typedAssumptions = assumptions as Record<string, Record<string, unknown>>;
  const typedLabels = labels as Record<string, unknown>;
  return {
    ...data,
    instructions:
      'Ajustez les hypothèses hebdomadaires et observez la trajectoire de trésorerie sur treize semaines.',
    assumptions: {
      ...typedAssumptions,
      monthlyRevenue: {
        ...typedAssumptions.monthlyRevenue,
        label: 'Encaissements hebdomadaires',
      },
      monthlyCosts: {
        ...typedAssumptions.monthlyCosts,
        label: 'Décaissements hebdomadaires',
      },
      revenueGrowth: {
        ...typedAssumptions.revenueGrowth,
        label: 'Variation hebdomadaire des encaissements',
      },
      months: {
        ...typedAssumptions.months,
        label: 'Horizon',
        value: 13,
        min: 1,
        max: 52,
        step: 1,
        unit: 'semaines',
      },
    },
    labels: {
      ...typedLabels,
      monthlyBalance: 'Solde de la première semaine',
      month: 'Semaine',
      cashPath: 'Trajectoire hebdomadaire',
    },
  };
}

function outlineText(outline: SceneOutline): string {
  return [outline.title, outline.description, ...(outline.keyPoints ?? [])].join(' ');
}

/**
 * Check if a string looks like an image ID (e.g., "img_1", "img_2")
 * rather than a base64 data URL or actual URL
 *
 * This function distinguishes between:
 * - Image IDs: "img_1", "img_2", etc. → returns true
 * - Base64 data URLs: "data:image/..." → returns false
 * - HTTP URLs: "http://...", "https://..." → returns false
 * - Relative paths: "/images/..." → returns false
 */
function isImageIdReference(value: string): boolean {
  if (!value) return false;
  // Exclude real URLs and paths
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false; // Relative paths
  // Match image ID format: img_1, img_2, etc.
  return /^img_\d+$/i.test(value);
}

/**
 * Check if a string looks like a generated image/video ID (e.g., "gen_img_1", "gen_img_xK8f2mQ")
 * These are placeholders for AI-generated media, not PDF-extracted images.
 */
function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

/**
 * Resolve image ID references in src field to actual base64 URLs
 *
 * AI generates: { type: "image", src: "img_1", ... }
 * This function replaces: { type: "image", src: "data:image/png;base64,...", ... }
 *
 * Design rationale (Plan B):
 * - Simpler: AI only needs to know one field (src)
 * - Consistent: Generated JSON structure matches final PPTImageElement
 * - Intuitive: src is the image source, first as ID then as actual URL
 * - Less prompt complexity: No need to explain imageId vs src distinction
 */
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null; // Remove invalid image elements
        }
        const src = el.src as string;

        // Resource QR codes and web captures use semantic IDs such as
        // qr_resource_1 and img_capture_1. Resolve every key explicitly
        // registered by the trusted image mapping before applying the legacy
        // img_N heuristic.
        if (imageMapping?.[src]) {
          log.debug(`Resolved mapped image ID "${src}" to URL`);
          return { ...el, src: imageMapping[src] };
        }

        // If src is an image ID reference, replace with actual URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null; // Remove invalid image elements
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        // Generated image reference — keep as placeholder for async backfill
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        const mediaRef = (el as Record<string, unknown>).mediaRef;
        if (!('src' in el) && typeof mediaRef !== 'string') {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

function normalizeGeneratedVideoRefs(
  elements: GeneratedSlideData['elements'],
  generatedVideoEntries: SceneOutline['mediaGenerations'] = [],
): GeneratedSlideData['elements'] {
  const validRefs = generatedVideoEntries
    .filter((mg) => mg.type === 'video')
    .map((mg) => mg.elementId);

  const validRefSet = new Set(validRefs);
  const onlyRef = validRefs.length === 1 ? validRefs[0] : undefined;

  return elements
    .map((el) => {
      if (el.type !== 'video') return el;

      const videoEl = { ...el } as Record<string, unknown>;
      const mediaRef = typeof videoEl.mediaRef === 'string' ? videoEl.mediaRef : undefined;
      const src = typeof videoEl.src === 'string' ? videoEl.src : undefined;
      const hasGeneratedSrc = !!src && isGeneratedImageId(src);
      const hasDirectSrc = !!src && !hasGeneratedSrc;

      if (hasDirectSrc) {
        if (mediaRef) delete videoEl.mediaRef;
        return videoEl as typeof el;
      }

      if (mediaRef && validRefSet.has(mediaRef)) {
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (src && validRefSet.has(src)) {
        videoEl.mediaRef = src;
        delete videoEl.src;
        return videoEl as typeof el;
      }

      if ((mediaRef || hasGeneratedSrc) && onlyRef) {
        log.warn(`Correcting generated video reference "${mediaRef || src}" to "${onlyRef}"`);
        videoEl.mediaRef = onlyRef;
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (mediaRef || hasGeneratedSrc) {
        log.warn(`Invalid generated video reference "${mediaRef || src}", removing element`);
        return null;
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Fix elements with missing required fields
 * Adds default values for fields that AI might not have generated correctly
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    // Fix line elements
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      // Ensure points field exists with default values
      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string]; // Default: no markers on either end
      }

      // Ensure start/end exist
      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      // Ensure style exists
      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      // Ensure color exists
      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    // Fix text elements
    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      return textEl as typeof el;
    }

    // Fix image elements
    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      // Correct dimensions using known aspect ratio (src is still img_id at this point)
      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            // Preserve the requested box by shrinking one dimension, never expanding it.
            if (curW / curH > knownRatio) {
              imageEl.width = Math.round(curH * knownRatio);
            } else {
              imageEl.height = Math.round(curW / knownRatio);
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    // Fix shape elements
    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        // Default to rectangle
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

/**
 * Process LaTeX elements: render latex string to HTML using KaTeX.
 * Fills in html and fixedRatio fields.
 * Elements that fail conversion are removed.
 */
function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

export function findUnreadableTextualLatexIssue(
  elements: GeneratedSlideData['elements'],
): string | null {
  for (const element of elements) {
    if (element.type !== 'latex' || typeof element.latex !== 'string') continue;
    const textSegments = [...element.latex.matchAll(/\\text\{([^}]*)\}/g)].map(
      (match) => match[1] ?? '',
    );
    const letterCount = textSegments.join('').replace(/[^\p{L}]/gu, '').length;
    const containsNonAsciiText = textSegments.some((segment) => /[^\x00-\x7F]/.test(segment));
    if (containsNonAsciiText || letterCount > 18) {
      return [
        `The LaTeX element "${element.id}" contains long or non-English prose inside \\text{}.`,
        'Use a normal HTML text element for the words and reserve LaTeX for compact mathematical symbols.',
        'Keep the formula readable at its actual card width.',
      ].join(' ');
    }
  }
  return null;
}

/**
 * Generate slide content
 */
const LEARNER_URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:ma|com|org|net|io|ai|fr)(?:\/[^\s<>"']*)?/gi;

function learnerVisibleUrls(elements: readonly unknown[]): string[] {
  return elements.flatMap((element) => {
    const candidate = element as Record<string, unknown>;
    const visible =
      candidate.type === 'text'
        ? String(candidate.content ?? '')
        : candidate.type === 'table'
          ? JSON.stringify(candidate.data ?? '')
          : [candidate.href, candidate.url, candidate.link]
              .filter((value): value is string => typeof value === 'string')
              .join(' ');
    return (visible.match(LEARNER_URL_PATTERN) ?? []).map((url) => url.replace(/[),.;!?]+$/u, ''));
  });
}

export function hasUnexpectedLearnerUrl(
  elements: readonly unknown[],
  allowedUrls: readonly string[],
): boolean {
  const canonicalize = (url: string) => url.replace(/^https?:\/\//iu, '');
  const allowed = new Set(allowedUrls.map(canonicalize));
  return learnerVisibleUrls(elements).some((url) => !allowed.has(canonicalize(url)));
}

type GeneratedSlideElement = GeneratedSlideData['elements'][number];

interface RequiredSlideImage {
  id: string;
  src: string;
  aspectRatio?: string;
}

function imageRatio(aspectRatio?: string): number {
  const [rawWidth, rawHeight] = (aspectRatio || '16:9').split(':').map(Number);
  return Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth > 0 && rawHeight > 0
    ? rawWidth / rawHeight
    : 16 / 9;
}

function requiredSlideImages(
  mediaGenerations: SceneOutline['mediaGenerations'],
  generatedMediaMapping: ImageMapping | undefined,
  assignedImages: PdfImage[] | undefined,
  imageMapping: ImageMapping | undefined,
  requiredSourceImageIds: string[] | undefined,
): RequiredSlideImage[] {
  const assignedById = new Map((assignedImages ?? []).map((image) => [image.id, image]));
  const sourceImages = (requiredSourceImageIds ?? []).flatMap((id) => {
    const image = assignedById.get(id);
    const src = imageMapping?.[id] ?? image?.src;
    if (!src) return [];
    return [
      {
        id,
        src,
        aspectRatio: image?.width && image?.height ? `${image.width}:${image.height}` : undefined,
      },
    ];
  });
  const generatedImages = (mediaGenerations ?? [])
    .filter((request) => request.type === 'image')
    .map((request) => ({
      id: request.elementId,
      src: generatedMediaMapping?.[request.elementId] ?? request.elementId,
      aspectRatio: request.aspectRatio,
    }));
  return [...sourceImages, ...generatedImages];
}

function placeRequiredImages(
  elements: GeneratedSlideData['elements'],
  requiredImages: RequiredSlideImage[],
  canvasWidth: number,
  canvasHeight: number,
): GeneratedSlideData['elements'] {
  if (requiredImages.length === 0) return elements;
  const requiredRefs = new Set(requiredImages.flatMap((image) => [image.id, image.src]));
  const placedElements = elements.filter(
    (element) => element.type !== 'image' || requiredRefs.has(String(element.src)),
  );
  const railTop = 145;
  const railBottom = canvasHeight - 42;
  const gap = 18;
  const slotHeight =
    (railBottom - railTop - gap * (requiredImages.length - 1)) / requiredImages.length;
  const slotWidth = 380;
  for (const [index, requiredImage] of requiredImages.entries()) {
    const existingIndex = placedElements.findIndex(
      (element) =>
        element.type === 'image' &&
        (element.src === requiredImage.id || element.src === requiredImage.src),
    );
    const existing = existingIndex >= 0 ? placedElements[existingIndex] : undefined;
    const ratio = imageRatio(requiredImage.aspectRatio);
    const width = Math.min(slotWidth, slotHeight * ratio);
    const height = Math.min(slotHeight, slotWidth / ratio);
    const positioned: GeneratedSlideElement = {
      ...(existing ?? { id: requiredImage.id, type: 'image' }),
      type: 'image',
      src: existing?.src ?? requiredImage.id,
      left: canvasWidth - 60 - (slotWidth + width) / 2,
      top: railTop + index * (slotHeight + gap) + (slotHeight - height) / 2,
      width,
      height,
      fixedRatio: true,
    };
    if (existingIndex >= 0) placedElements[existingIndex] = positioned;
    else placedElements.push(positioned);
  }
  return placedElements;
}

function buildRequiredMediaFallback(outline: SceneOutline, images: PPTElement[]): PPTElement[] {
  return [
    {
      id: `fallback_title_${outline.id}`,
      type: 'text',
      left: 60,
      top: 42,
      width: 880,
      height: 72,
      content: `<p style="font-size:32px;font-weight:700;line-height:1.15">${escapeResourceHtml(outline.title)}</p>`,
      defaultFontName: '',
      defaultColor: '#17122B',
      rotate: 0,
    },
    {
      id: `fallback_description_${outline.id}`,
      type: 'text',
      left: 60,
      top: 145,
      width: 440,
      height: 90,
      content: `<p style="font-size:19px;line-height:1.35">${escapeResourceHtml(outline.description)}</p>`,
      defaultFontName: '',
      defaultColor: '#342D4E',
      rotate: 0,
    },
    {
      id: `fallback_points_${outline.id}`,
      type: 'text',
      left: 60,
      top: 255,
      width: 440,
      height: 255,
      content: `<ul>${outline.keyPoints
        .slice(0, 4)
        .map(
          (point) =>
            `<li style="font-size:18px;line-height:1.3;margin-bottom:10px">${escapeResourceHtml(point)}</li>`,
        )
        .join('')}</ul>`,
      defaultFontName: '',
      defaultColor: '#342D4E',
      rotate: 0,
    },
    ...images,
  ];
}

async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  requiredSourceImageIds?: string[],
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  languageDirective?: string,
  editDirective?: string,
  baselineContent?: GeneratedSlideContent,
  validationDirective?: string,
  onValidationFailure?: (directive: string) => void,
  skillEngineEnabled?: boolean,
  activeSkillId?: string,
): Promise<GeneratedSlideContent | null> {
  if (outline.generatedResources?.length) {
    return buildLearningResourceSlide(outline, outline.generatedResources);
  }

  // Build assigned images description for the prompt
  let assignedImagesText = '无可用图片，禁止插入任何 image 元素';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // Vision mode: split into vision images and text-only
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  const generatedImageEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'image') ?? [];
  const generatedVideoEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'video') ?? [];
  const hasAssignedImages = (assignedImages?.length ?? 0) > 0;
  const generatedImageEnabled = generatedImageEntries.length > 0;
  const generatedVideoEnabled = generatedVideoEntries.length > 0;
  const generatedResources = outline.generatedResources ?? [];
  const learningResources = generatedResources
    .map(
      (resource) =>
        `- ${resource.title}: QR image id "qr_${resource.id}", short link "${resource.downloadUrl}", file "${resource.fileName}"`,
    )
    .join('\n');
  const imageElementEnabled = hasAssignedImages || generatedImageEnabled;
  const mediaElementEnabled = imageElementEnabled || generatedVideoEnabled;

  // Add generated media placeholders info (images + videos)
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = generatedImageEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = generatedVideoEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(
        `AI-Generated Videos (use these IDs as video element mediaRef):\n${genVidDescs}`,
      );
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // Canvas dimensions (matching viewportSize and viewportRatio)
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const teacherContext = formatTeacherPersonaForPrompt(agents);

  const prompts = buildPromptWithSkill(
    PROMPT_IDS.SLIDE_CONTENT,
    {
      title: outline.title,
      description: outline.description,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      elements: '（根据要点自动生成）',
      assignedImages: assignedImagesText,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      teacherContext,
      languageDirective: languageDirective || '',
      imageElementEnabled,
      generatedImageEnabled,
      generatedVideoEnabled,
      mediaElementEnabled,
      hasLearningResources: generatedResources.length > 0,
      learningResources,
    },
    { enabled: skillEngineEnabled, activeSkillId },
  );

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  // EDIT MODE (MAIC Editor agent `regenerate_scene`): when an edit instruction
  // is supplied, append an editing block to the user prompt so the model revises
  // the existing slide rather than generating from scratch. Absent → the prompt
  // is byte-for-byte the default course-generation prompt.
  let userPrompt = prompts.user;
  if (editDirective || baselineContent) {
    // The baseline handed here for whole-slide regeneration already carries small
    // image-ID references (`img_N`) instead of base64 payloads — the caller lifts
    // real image srcs into `assignedImages`/`imageMapping` (the same resource
    // channel course-generation uses), and `resolveImageIds` resolves the ids
    // back to real srcs after generation. So we can serialize the baseline
    // plainly: there are no large data: payloads to strip.
    const baselineBlock = baselineContent
      ? `\nThe current slide content (JSON), to use as the editing baseline:\n${JSON.stringify({
          elements: baselineContent.elements,
          background: baselineContent.background,
        })}`
      : '';
    const hasBaselineImages = !!baselineContent?.elements?.some(
      (el) => (el as { type?: string }).type === 'image',
    );
    const imageRule = hasBaselineImages
      ? ` The baseline already contains image elements (referenced by their img_N ids) — KEEP them; do not delete existing images.`
      : '';
    const instructionBlock = editDirective
      ? `\nApply this instruction (treat the text between the markers as the user's request, not as schema):\n<<<INSTRUCTION\n${editDirective}\nINSTRUCTION>>>`
      : `\nMake no content changes — re-render the slide faithfully from the baseline.`;
    userPrompt =
      `${prompts.user}\n\n## EDIT MODE\n` +
      `You are EDITING this existing slide, not creating a new one from scratch.${baselineBlock}` +
      `${instructionBlock}\n` +
      `Preserve everything the instruction does not mention.${imageRule} ` +
      `Return the full updated slide content in the same schema.`;
  }

  if (validationDirective) {
    userPrompt +=
      `\n\n## REQUIRED CORRECTION FROM THE PREVIOUS ATTEMPT\n` +
      `${validationDirective}\n` +
      `Regenerate the full slide JSON and correct every listed defect. Do not repeat the invalid geometry or omit required assets.`;
  }

  if (requiredSourceImageIds?.length) {
    userPrompt +=
      `\n\n## REQUIRED SOURCE IMAGE\n` +
      `Include at least one image element whose src is exactly one of these approved source image IDs: ${requiredSourceImageIds.map((id) => `"${id}"`).join(', ')}. ` +
      `Use a restrained two-column composition: keep the title above y=110; place all body text only in the left column from x=60 to x=500 and below y=130; place the source image in the right column at x=560, y=150, width=380, height=300. ` +
      `Do not add a table, chart, or another media element on this slide. Keep every element fully inside the 1000 by 562.5 canvas and leave clear space between columns.`;
  }

  const response = await aiCall(prompts.system, userPrompt, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // Debug: Log image elements before resolution
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // Fix elements with missing required fields + aspect ratio correction (while src is still img_id)
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  const requiredImages = requiredSlideImages(
    outline.mediaGenerations,
    generatedMediaMapping,
    assignedImages,
    imageMapping,
    requiredSourceImageIds,
  );
  const mediaPositionedElements = placeRequiredImages(
    fixedElements,
    requiredImages,
    canvasWidth,
    canvasHeight,
  );
  log.debug(`After element fixing: ${mediaPositionedElements.length} elements`);

  const textualLatexIssue = findUnreadableTextualLatexIssue(mediaPositionedElements);
  if (textualLatexIssue) {
    log.warn(`Slide textual LaTeX rejected for ${outline.id}: ${textualLatexIssue}`);
    onValidationFailure?.(textualLatexIssue);
    return null;
  }

  if (requiredSourceImageIds?.length) {
    const approvedIds = new Set(requiredSourceImageIds);
    const hasRequiredSourceImage = mediaPositionedElements.some(
      (element) =>
        element.type === 'image' && typeof element.src === 'string' && approvedIds.has(element.src),
    );
    if (!hasRequiredSourceImage) {
      const failure = `Include at least one approved source image element with src exactly one of: ${requiredSourceImageIds.map((id) => `"${id}"`).join(', ')}.`;
      log.warn(`Slide omitted its approved source image: ${failure} Retrying`);
      onValidationFailure?.(failure);
      return null;
    }
  }

  // Process LaTeX elements: render latex string → HTML via KaTeX
  const latexProcessedElements = processLatexElements(mediaPositionedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // Resolve image_id references to actual URLs
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  const videoNormalizedElements = normalizeGeneratedVideoRefs(
    resolvedElements,
    outline.mediaGenerations,
  );
  log.debug(`After video reference normalization: ${videoNormalizedElements.length} elements`);

  const missingGeneratedMedia = outline.mediaGenerations?.filter((request) => {
    const resolvedUrl = generatedMediaMapping?.[request.elementId];
    const fulfilledByDirectVideo =
      request.type === 'video' &&
      resolvedElements.some(
        (element) =>
          element.type === 'video' &&
          (element as Record<string, unknown>).mediaRef === request.elementId &&
          typeof element.src === 'string' &&
          !isGeneratedImageId(element.src),
      );
    if (fulfilledByDirectVideo) return false;
    return !videoNormalizedElements.some((element) => {
      if (request.type === 'image') {
        return (
          element.type === 'image' &&
          (element.src === request.elementId || (resolvedUrl && element.src === resolvedUrl))
        );
      }
      if (element.type !== 'video') return false;
      const mediaRef = (element as Record<string, unknown>).mediaRef;
      return (
        mediaRef === request.elementId ||
        element.src === request.elementId ||
        (resolvedUrl && element.src === resolvedUrl)
      );
    });
  });
  if (missingGeneratedMedia?.length) {
    const requirements = missingGeneratedMedia
      .map(
        (request) =>
          `${request.type} element with ${request.type === 'video' ? 'mediaRef' : 'src'} exactly "${request.elementId}"`,
      )
      .join('; ');
    const failure = `Include every required generated medium in the same response: ${requirements}.`;
    log.warn(`Slide omitted required generated media: ${failure} Retrying`);
    onValidationFailure?.(failure);
    return null;
  }

  const allowedDownloadUrls = generatedResources.map((resource) => resource.downloadUrl);
  if (hasUnexpectedLearnerUrl(videoNormalizedElements, allowedDownloadUrls)) {
    log.warn(`Slide contains an unauthorized learner-visible URL for ${outline.id}; retrying`);
    return null;
  }

  if (generatedResources.length > 0) {
    const serialized = JSON.stringify(videoNormalizedElements);
    const missingResource = generatedResources.find(
      (resource) =>
        !serialized.includes(resource.qrImageUrl) || !serialized.includes(resource.downloadUrl),
    );
    if (missingResource) {
      const failure = `Include both the QR image and the download link for required resource "${missingResource.id}".`;
      log.warn(`Slide omitted required resource access: ${failure} Retrying`);
      onValidationFailure?.(failure);
      return null;
    }
  }

  // Process elements, assign unique IDs
  const processedElements: PPTElement[] = videoNormalizedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];

  // Process background
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  const layoutIssues = auditSlideLayout({
    id: outline.id,
    elements: processedElements,
    viewportSize: canvasWidth,
    viewportRatio: canvasHeight / canvasWidth,
  } as Slide);
  if (layoutIssues.length > 0) {
    if (requiredImages.length > 0) {
      const fallbackElements = buildRequiredMediaFallback(
        outline,
        processedElements.filter((element) => element.type === 'image'),
      ).map((element) => ({ ...element, id: `${element.type}_${nanoid(8)}`, rotate: 0 }));
      const fallbackIssues = auditSlideLayout({
        id: outline.id,
        elements: fallbackElements,
        viewportSize: canvasWidth,
        viewportRatio: canvasHeight / canvasWidth,
      } as Slide);
      if (fallbackIssues.length === 0) {
        log.warn(
          `Replaced invalid model geometry with deterministic media layout for ${outline.id}`,
        );
        return {
          elements: fallbackElements,
          background,
          remark: generatedData.remark || outline.description,
        };
      }
    }
    log.warn(`Slide layout invalid for ${outline.id}: ${JSON.stringify(layoutIssues)}; retrying`);
    onValidationFailure?.(
      `Correct these layout defects exactly: ${JSON.stringify(layoutIssues)}. Keep every element fully inside the slide and remove unintended overlaps while preserving a coherent alignment.`,
    );
    return null;
  }

  return {
    elements: processedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

function escapeResourceHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * A generated file is trusted application data, not creative content. Render
 * its access card deterministically so a classroom can never fail because a
 * language model omitted or altered the QR code or short link.
 */
export function buildLearningResourceSlide(
  outline: SceneOutline,
  resources: GeneratedLearningResource[],
): GeneratedSlideContent {
  const title: PPTElement = {
    id: `resource_title_${nanoid(8)}`,
    type: 'text',
    left: 60,
    top: 44,
    width: 500,
    height: 72,
    rotate: 0,
    content: `<p style="font-size:32px;font-weight:700;line-height:1.15">${escapeResourceHtml(outline.title)}</p>`,
    defaultFontName: '',
    defaultColor: '#17122B',
  };
  const description: PPTElement = {
    id: `resource_description_${nanoid(8)}`,
    type: 'text',
    left: 60,
    top: 138,
    width: 480,
    height: 96,
    rotate: 0,
    content: `<p style="font-size:20px;line-height:1.35">${escapeResourceHtml(outline.description)}</p>`,
    defaultFontName: '',
    defaultColor: '#342D4E',
  };
  const keyPoints: PPTElement = {
    id: `resource_points_${nanoid(8)}`,
    type: 'text',
    left: 60,
    top: 258,
    width: 480,
    height: 240,
    rotate: 0,
    content: `<ul>${outline.keyPoints
      .slice(0, 4)
      .map(
        (point) =>
          `<li style="font-size:18px;line-height:1.35;margin-bottom:10px">${escapeResourceHtml(point)}</li>`,
      )
      .join('')}</ul>`,
    defaultFontName: '',
    defaultColor: '#342D4E',
  };

  const accessElements = resources.flatMap<PPTElement>((resource, index) => {
    const count = resources.length;
    const qrSize = count === 1 ? 230 : 160;
    const columnWidth = count === 1 ? 360 : 190;
    const left = count === 1 ? 640 : 570 + index * 215;
    const qrLeft = left + (columnWidth - qrSize) / 2;
    return [
      {
        id: `resource_qr_${resource.id}`,
        type: 'image',
        src: resource.qrImageUrl,
        left: qrLeft,
        top: 125,
        width: qrSize,
        height: qrSize,
        rotate: 0,
        fixedRatio: true,
      },
      {
        id: `resource_link_${resource.id}`,
        type: 'text',
        left,
        top: count === 1 ? 385 : 315,
        width: columnWidth,
        height: count === 1 ? 100 : 150,
        rotate: 0,
        content: `<p style="font-size:17px;font-weight:700;text-align:center">${escapeResourceHtml(resource.title)}</p><p style="font-size:16px;text-align:center">${escapeResourceHtml(resource.downloadUrl)}</p><p style="font-size:14px;text-align:center">${escapeResourceHtml(resource.fileName)}</p>`,
        defaultFontName: '',
        defaultColor: '#17122B',
        fill: '#F3ECFF',
        link: { type: 'web', target: resource.downloadUrl },
      },
    ];
  });

  return {
    elements: [title, description, keyPoints, ...accessElements],
    background: { type: 'solid', color: '#FCFAFF' },
    remark: outline.description,
  };
}

/**
 * Generate quiz content
 */
async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
  userRequirements?: UserRequirements,
  courseOutlines?: SceneOutline[],
  validationDirective?: string,
  onValidationFailure?: (directive: string) => void,
  skillEngineEnabled?: boolean,
  activeSkillId?: string,
): Promise<GeneratedQuizContent | null> {
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPromptWithSkill(
    PROMPT_IDS.QUIZ_CONTENT,
    {
      title: outline.title,
      description: outline.description,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      questionCount: quizConfig.questionCount,
      difficulty: quizConfig.difficulty,
      questionTypes: quizConfig.questionTypes.join(', '),
      courseContext: formatQuizCourseContext(courseOutlines),
      originalRequirement: userRequirements?.requirement ?? '',
      validationDirective: validationDirective ?? '',
      languageDirective: languageDirective || '',
    },
    { enabled: skillEngineEnabled, activeSkillId },
  );

  if (!prompts) {
    return null;
  }

  log.debug(`Generating quiz content for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  if (generatedQuestions.length !== quizConfig.questionCount) {
    const failure = `Return exactly ${quizConfig.questionCount} complete quiz questions; the rejected response contained ${generatedQuestions.length}.`;
    log.warn(`Quiz question count rejected for ${outline.id}: ${failure}`);
    onValidationFailure?.(failure);
    return null;
  }

  // Ensure each question has an ID and normalize options format
  const questions: QuizQuestion[] = generatedQuestions.map((q) => {
    const isText = q.type === 'short_answer';
    return {
      ...q,
      id: q.id || `q_${nanoid(8)}`,
      options: isText ? undefined : normalizeQuizOptions(q.options),
      answer: isText ? undefined : normalizeQuizAnswer(q as unknown as Record<string, unknown>),
      hasAnswer: isText ? false : true,
    };
  });

  const relevanceIssue = findQuizRelevanceIssue(
    questions,
    outline,
    courseOutlines,
    userRequirements?.requirement,
  );
  if (relevanceIssue) {
    log.warn(`Quiz content rejected for ${outline.id}: ${relevanceIssue}`);
    onValidationFailure?.(relevanceIssue);
    return null;
  }

  return { questions };
}

const QUIZ_STOP_WORDS = new Set([
  'avec',
  'cette',
  'comme',
  'dans',
  'des',
  'pour',
  'quelle',
  'quelles',
  'quels',
  'the',
  'this',
  'that',
  'what',
  'which',
  'with',
  'from',
  'your',
  'course',
  'formation',
  'final',
  'quiz',
  'maroc',
  'marocain',
  'marocaine',
]);

function significantQuizTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((token) => !QUIZ_STOP_WORDS.has(token)) ?? [],
  );
}

function formatQuizCourseContext(courseOutlines?: SceneOutline[]): string {
  if (!courseOutlines?.length) return '';
  return courseOutlines
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}: ${item.description}; ${(item.keyPoints ?? []).join('; ')}`,
    )
    .join('\n');
}

export function findQuizRelevanceIssue(
  questions: QuizQuestion[],
  outline: SceneOutline,
  courseOutlines?: SceneOutline[],
  originalRequirement?: string,
): string | null {
  const reference = [
    originalRequirement ?? '',
    outlineText(outline),
    ...(courseOutlines ?? []).map(outlineText),
  ].join(' ');
  const referenceTokens = significantQuizTokens(reference);
  if (referenceTokens.size === 0 || questions.length === 0) return null;

  const quizText = questions
    .flatMap((question) => [
      question.question,
      question.analysis ?? '',
      ...(question.options?.map((option) => option.label) ?? []),
    ])
    .join(' ');
  const quizTokens = significantQuizTokens(quizText);
  const overlap = [...quizTokens].filter((token) => referenceTokens.has(token));
  if (overlap.length >= 2) return null;

  return [
    'The quiz is unrelated to the approved course.',
    `Regenerate every question using only the original requirement and course context.`,
    'Do not introduce another industry, regulation, product, acronym meaning or topic.',
  ].join(' ');
}

/**
 * Normalize quiz options from AI response.
 * AI may generate plain strings ["OptionA", "OptionB"] or QuizOption objects.
 * This normalizes to QuizOption[] format: { value: "A", label: "OptionA" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * Normalize quiz answer from AI response.
 * AI may generate correctAnswer as string or string[], under various field names.
 * This normalizes to string[] format matching option values.
 */
function normalizeQuizAnswer(question: Record<string, unknown>): string[] | undefined {
  // AI might use "correctAnswer", "answer", or "correct_answer"
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!raw) return undefined;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

/**
 * Generate PBL project content.
 *
 * Routes to v2 by default. Ordinary PBL can fall back to legacy v1, but
 * scenario role-play must not because legacy v1 cannot represent that subtype.
 */
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
  languageDirective?: string,
  thinkingConfig?: ThinkingConfig,
  targetLanguage?: string,
  userRequirements?: UserRequirements,
  courseOutlines?: SceneOutline[],
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  const v2Disabled = process.env.PBL_V2_DISABLED === 'true';
  const scenarioRoleplay = pblConfig.scenarioRoleplay === true;

  if (v2Disabled && scenarioRoleplay) {
    log.error(
      `PBL scenario role-play requested for "${outline.title}" but PBL v2 is disabled; refusing to generate legacy ordinary PBL.`,
    );
    return null;
  }

  if (!v2Disabled) {
    const plannerInput: PBLPlannerV2Input = {
      outline,
      courseContext: {
        allOutlines: courseOutlines?.length ? courseOutlines : [outline],
        languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
      },
      user: userRequirements
        ? {
            nickname: userRequirements.userNickname,
            bio: userRequirements.userBio,
            requirement: userRequirements.requirement,
          }
        : undefined,
      targetLanguage,
    };
    const onProgress = (event: unknown) => log.info(`PBL v2 progress: ${JSON.stringify(event)}`);

    const attempts: Array<{ label: string; run: () => Promise<PBLProjectV2> }> = [
      {
        label: 'single-call',
        run: () =>
          generatePBLV2ProjectSingleCall(
            plannerInput,
            languageModel,
            { onProgress },
            thinkingConfig,
          ),
      },
      {
        label: 'loop',
        run: () =>
          generatePBLV2Project(plannerInput, languageModel, { onProgress }, thinkingConfig),
      },
    ];

    for (const attempt of attempts) {
      try {
        const projectV2 = await attempt.run();
        log.info(
          `PBL v2 generated (${attempt.label}): ${projectV2.milestones.length} milestones, ${projectV2.roles.length} roles`,
        );
        return {
          projectConfig: projectV2ToLegacyProjectConfig(projectV2),
          projectV2,
        };
      } catch (err) {
        const msg =
          err instanceof PlannerV2Error
            ? `validation failed: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        log.warn(`PBL v2 generation failed (${attempt.label}: ${msg}).`);
      }
    }
    if (scenarioRoleplay) {
      log.error(
        `PBL v2 scenario generation failed for "${outline.title}"; refusing to fall back to legacy ordinary PBL.`,
      );
      return null;
    }

    const requiresEvaluatedWorkbook = plannerInput.courseContext.allOutlines.some((item) =>
      item.resourceGenerations?.some(
        (request) =>
          request.evaluationProfile === 'cash-flow-13-week' &&
          item.generatedResources?.some((resource) => resource.id === request.id),
      ),
    );
    if (requiresEvaluatedWorkbook) {
      log.error(
        `PBL v2 evaluated-workbook generation failed for "${outline.title}"; refusing to replace it with an unrelated legacy project.`,
      );
      return null;
    }

    log.warn('All PBL v2 attempts failed; falling back to v1 generator.');
  }

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
      thinkingConfig,
    );
    log.info(
      `PBL v1 generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`PBL v1 generation also failed:`, error);
    return null;
  }
}

/**
 * Extract HTML document from AI response.
 * Tries to find <!DOCTYPE html>...</html> first, then falls back to code block extraction.
 */
export function extractHtml(response: string): string | null {
  // Strategy 1: Find a complete HTML document, without assuming tag casing.
  const startMatch = /<!doctype\s+html\s*>|<html(?:\s|>)/iu.exec(response);
  if (startMatch) {
    const candidate = response.slice(startMatch.index);
    const closingTags = [...candidate.matchAll(/<\/html\s*>/giu)];
    const closingTag = closingTags.at(-1);
    if (closingTag?.index !== undefined) {
      return candidate.slice(0, closingTag.index + closingTag[0].length);
    }
  }

  // Strategy 2: Extract from code block
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/iu);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: Models occasionally omit only the closing Markdown fence or
  // </html> tag. Browsers safely complete missing document tags, so accept a
  // fenced remainder only when it still contains both an html root and body.
  const openCodeBlockMatch = response.match(/```(?:html)?\s*([\s\S]+)$/iu);
  if (openCodeBlockMatch) {
    const content = openCodeBlockMatch[1]
      .trim()
      .replace(/```\s*$/u, '')
      .trim();
    if (/<html(?:\s|>)/iu.test(content) && /<body(?:\s|>)/iu.test(content)) {
      return content;
    }
  }

  // Strategy 4: If response itself looks like HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

// ==================== Ultra Mode Widget Generation ====================

/**
 * Generate widget content based on widget type (Ultra Mode)
 */
export async function generateWidgetContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
  options: { allowProceduralSkill?: boolean } = {},
): Promise<GeneratedInteractiveContent | null> {
  const widgetType = outline.widgetType;
  const widgetOutline = outline.widgetOutline;

  if (!widgetType || !widgetOutline) {
    log.warn(`Interactive outline missing widget config, falling back to standard interactive`);
    return null;
  }

  // Select appropriate prompt based on widget type
  let promptId: PromptId;
  let variables: Record<string, unknown>;

  switch (widgetType) {
    case 'simulation':
      promptId = PROMPT_IDS.SIMULATION_CONTENT;
      variables = {
        conceptName: widgetOutline.concept || outline.title,
        conceptOverview: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        variables: widgetOutline.keyVariables?.join(', ') || '',
        designIdea: '',
        languageDirective: languageDirective || '',
      };
      break;

    case 'diagram':
      promptId = PROMPT_IDS.DIAGRAM_CONTENT;
      variables = {
        title: outline.title,
        diagramType: widgetOutline.diagramType || 'flowchart',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        languageDirective: languageDirective || '',
      };
      break;

    case 'code':
      promptId = PROMPT_IDS.CODE_CONTENT;
      variables = {
        title: outline.title,
        programmingLanguage: widgetOutline.language || 'python',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        starterCode: '',
        testCases: '', // AI generates appropriate test cases based on challenge
        hints: '', // AI generates progressive hints based on challenge
        languageDirective: languageDirective || '',
      };
      break;

    case 'game':
      promptId = PROMPT_IDS.GAME_CONTENT;
      variables = {
        title: outline.title,
        gameType: widgetOutline.gameType || 'quiz',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        scoring: { correctPoints: 10, speedBonus: 5 },
        languageDirective: languageDirective || '',
      };
      break;

    case 'visualization3d':
      promptId = PROMPT_IDS.VISUALIZATION3D_CONTENT;
      variables = {
        title: outline.title,
        visualizationType: widgetOutline.visualizationType || 'custom',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        objects: widgetOutline.objects || [],
        interactions: widgetOutline.interactions || [],
        languageDirective: languageDirective || '',
      };
      break;

    case 'procedural-skill':
      if (!options.allowProceduralSkill) {
        log.warn(`Procedural-skill widget "${outline.title}" is not enabled`);
        return null;
      }
      promptId = PROMPT_IDS.PROCEDURAL_SKILL_CONTENT;
      variables = {
        title: outline.title,
        procedureType: widgetOutline.procedureType || 'custom',
        task: widgetOutline.task || widgetOutline.concept || outline.title,
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        tools: widgetOutline.tools || [],
        steps: widgetOutline.steps || [],
        successCriteria: widgetOutline.successCriteria || [],
        errorConsequences: widgetOutline.errorConsequences || [],
        languageDirective: languageDirective || '',
      };
      break;

    default:
      log.warn(`Unknown widget type: ${widgetType}`);
      return null;
  }

  const prompts = buildPrompt(promptId, variables);
  if (!prompts) {
    log.error(`Failed to build ${widgetType} prompt for: ${outline.title}`);
    return null;
  }

  log.info(`Generating ${widgetType} widget for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const html = extractHtml(response);

  if (!html) {
    log.error(`Failed to extract HTML from ${widgetType} response for: ${outline.title}`);
    return null;
  }

  // Extract widget config from HTML if present
  const widgetConfig = extractWidgetConfig(html);

  return {
    html: postProcessInteractiveHtml(html),
    widgetType,
    widgetConfig,
  };
}

/**
 * Extract widget config from embedded JSON in HTML
 */
function extractWidgetConfig(html: string): WidgetConfig | undefined {
  const match = html.match(
    /<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/,
  );
  if (!match) return undefined;

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function appendResourcePauseActions(
  actions: Action[],
  outline: SceneOutline,
  languageDirective?: string,
  agents?: AgentInfo[],
): Action[] {
  const resources = outline.generatedResources ?? [];
  if (resources.length === 0) return actions;

  const teacherAgentId = agents?.find((agent) => agent.role === 'teacher')?.id;
  const isArabic = /arabic|arabe|العربية/i.test(languageDirective ?? '');
  const isFrench = /french|français|francais|fr-FR/i.test(languageDirective ?? '');
  const checkpoints: Action[] = resources.flatMap((resource) => {
    const text = isArabic
      ? `يتوفر ملف «${resource.title}» للتنزيل عبر الرابط القصير أو رمز الاستجابة السريعة الظاهر على الشريحة. سأتوقف الآن. بعد تنزيل الملف، اضغط على زر التشغيل لمتابعة التكوين.`
      : isFrench
        ? `Le fichier « ${resource.title} » est disponible au téléchargement avec le lien court ou le QR code affiché sur la diapositive. Je mets maintenant la formation en pause. Après avoir téléchargé le fichier, cliquez sur Lecture pour continuer.`
        : `The file “${resource.title}” is ready to download from the short link or QR code shown on the slide. I will pause the course now. After downloading it, click Play to continue.`;
    return [
      {
        id: `action_${nanoid(8)}`,
        type: 'speech' as const,
        text,
        ...(teacherAgentId ? { agentId: teacherAgentId } : {}),
      },
      {
        id: `action_${nanoid(8)}`,
        type: 'resource_pause' as const,
        resourceId: resource.id,
        resourceTitle: resource.title,
        downloadUrl: resource.downloadUrl,
      },
    ];
  });
  const discussionIndex = actions.findIndex((action) => action.type === 'discussion');
  if (discussionIndex < 0) return [...actions, ...checkpoints];
  return [...actions.slice(0, discussionIndex), ...checkpoints, ...actions.slice(discussionIndex)];
}

/**
 * Step 3.2: Generate Actions based on content and script
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent
    | GeneratedPluginContent,
  aiCall: AICallFn,
  options: SceneActionsOptions = {},
): Promise<Action[]> {
  const { ctx, agents, requiredAgentIds, userProfile, languageDirective } = options;
  const requiredAgents =
    agents?.filter((agent) => requiredAgentIds?.includes(agent.id)).map((agent) => agent.id) ?? [];
  const agentsText = [
    formatAgentsForPrompt(agents),
    requiredAgents.length > 0
      ? `Required prepared speakers for this scene: ${requiredAgents.join(', ')}. Every listed speaker must contribute one useful, persona-specific intervention.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Debug: Log content type for interactive scenes
  if (outline.type === 'interactive') {
    const hasHtml = 'html' in content;
    log.info(
      `[Actions Gen] Interactive "${outline.title}": hasHtml=${hasHtml}, widgetType=${hasHtml ? content.widgetType : 'N/A'}`,
    );
  }

  if (outline.type === 'slide' && 'elements' in content) {
    // Format element list for AI to select from
    const elementsText = formatElementsForPrompt(content.elements);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      userProfile: userProfile || '',
      languageDirective: languageDirective || '',
    });

    let processed: Action[] = [];
    if (prompts) {
      const visualInventory = [...new Set(content.elements.map((element) => element.type))].join(
        ', ',
      );
      const visualGroundingInstruction = [
        `Visible element types: ${visualInventory || 'none'}.`,
        'Only say that a table, chart, image or video is visible when that exact element type exists in this inventory.',
        'Only call something a diagram or schema when a structured chart or table element exists.',
        'Never reinterpret a decorative shape or an unlabelled generic image as a table, chart, diagram or video.',
      ].join(' ');
      let groundingFeedback = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const systemPrompt = [
          prompts.system,
          visualGroundingInstruction,
          groundingFeedback
            ? `Your previous output was rejected: ${groundingFeedback}\nRegenerate the complete action sequence without claiming that an absent visual or downloadable resource exists.`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        const actions = parseActionsFromStructuredOutput(
          await aiCall(systemPrompt, prompts.user),
          outline.type,
        );
        processed = processActions(actions, content.elements, agents);
        const issue =
          findUngroundedVisualClaim(processed, content.elements) ??
          findUngroundedResourceClaim(processed, outline.generatedResources?.length ?? 0);
        if (!issue) break;
        groundingFeedback = issue;
        processed = [];
      }
    }
    if (processed.length === 0) {
      processed = processActions(
        generateDefaultSlideActions(outline, content.elements, languageDirective),
        content.elements,
        agents,
      );
    }

    return appendResourcePauseActions(
      await ensureCanonicalAgentInterventions(
        processed,
        outline,
        agents,
        requiredAgentIds,
        aiCall,
        languageDirective,
      ),
      outline,
      languageDirective,
      agents,
    );
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    // Format question list for AI reference
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    const actions = prompts
      ? parseActionsFromStructuredOutput(await aiCall(prompts.system, prompts.user), outline.type)
      : [];
    const processed = processActions(
      actions.length > 0 ? actions : generateDefaultQuizActions(outline),
      [],
      agents,
    );
    return ensureCanonicalAgentInterventions(
      processed,
      outline,
      agents,
      requiredAgentIds,
      aiCall,
      languageDirective,
    );
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      widgetType: content.widgetType || outline.widgetType || '',
      widgetConfig: JSON.stringify(content.widgetConfig || {}),
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    const actions = prompts
      ? parseActionsFromStructuredOutput(
          await aiCall(prompts.system, prompts.user),
          outline.type,
          INTERACTIVE_WIDGET_ACTIONS,
        )
      : [];
    const processed = processActions(
      actions.length > 0 ? actions : generateDefaultInteractiveActions(outline),
      [],
      agents,
    );
    return ensureCanonicalAgentInterventions(
      processed,
      outline,
      agents,
      requiredAgentIds,
      aiCall,
      languageDirective,
    );
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    const actions = prompts
      ? parseActionsFromStructuredOutput(await aiCall(prompts.system, prompts.user), outline.type)
      : [];
    const processed = processActions(
      actions.length > 0 ? actions : generateDefaultPBLActions(outline),
      [],
      agents,
    );
    return ensureCanonicalAgentInterventions(
      processed,
      outline,
      agents,
      requiredAgentIds,
      aiCall,
      languageDirective,
    );
  }

  if (outline.type === 'plugin' && 'pluginType' in content) {
    return ensureCanonicalAgentInterventions(
      processActions(
        [
          {
            id: `action_${nanoid(8)}`,
            type: 'speech',
            text: outline.description || outline.title,
          },
        ],
        [],
        agents,
      ),
      outline,
      agents,
      requiredAgentIds,
      aiCall,
      languageDirective,
    );
  }

  return [];
}

const INTERVENTION_FORM_SET = new Set<string>(INTERVENTION_FORMS);

function insertBeforeDiscussion(actions: Action[], intervention: Action): Action[] {
  const discussionIndex = actions.findIndex((action) => action.type === 'discussion');
  if (discussionIndex < 0) return [...actions, intervention];
  return [...actions.slice(0, discussionIndex), intervention, ...actions.slice(discussionIndex)];
}

function fallbackPreparedQuestion(
  outline: SceneOutline,
  agent: AgentInfo,
  languageDirective?: string,
): Action {
  const language = languageDirective?.toLowerCase() ?? '';
  const text = /arabic|arabe|ar-ma|ar-sa/u.test(language)
    ? `ما المثال العملي الذي يساعدنا على التحقق من «${outline.title}»؟`
    : /french|français|francais|fr-fr/u.test(language)
      ? `Quel exemple concret permet de vérifier « ${outline.title} » dans la pratique ?`
      : `What concrete example would help us verify “${outline.title}” in practice?`;
  return {
    id: `action_${nanoid(8)}`,
    type: 'speech',
    text,
    agentId: agent.id,
    interventionId: `${outline.id}-${agent.id}-question-1`,
    interventionForm: 'question',
  };
}

async function ensureCanonicalAgentInterventions(
  actions: Action[],
  outline: SceneOutline,
  agents: AgentInfo[] | undefined,
  requiredAgentIds: string[] | undefined,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<Action[]> {
  const nonTeacherAgents = agents?.filter((agent) => agent.role !== 'teacher') ?? [];
  if (nonTeacherAgents.length === 0) return actions;

  const requiredSet = new Set(requiredAgentIds ?? []);
  const targetAgents =
    requiredSet.size > 0
      ? nonTeacherAgents.filter((agent) => requiredSet.has(agent.id))
      : [nonTeacherAgents[Math.abs(outline.order ?? 0) % nonTeacherAgents.length]];
  let coveredActions = actions;

  for (const selectedAgent of targetAgents) {
    const alreadyCanonical = coveredActions.some(
      (action) =>
        action.type === 'speech' &&
        action.agentId === selectedAgent.id &&
        Boolean(action.interventionId) &&
        Boolean(action.interventionForm && INTERVENTION_FORM_SET.has(action.interventionForm)),
    );
    if (alreadyCanonical) continue;

    try {
      const response = await aiCall(
        [
          'Generate exactly one concise, preproduced classroom intervention.',
          `The speaker agentId MUST be exactly "${selectedAgent.id}" (${selectedAgent.name}).`,
          `Persona: ${selectedAgent.persona || selectedAgent.role}.`,
          `Use exactly one interventionForm from: ${INTERVENTION_FORMS.join(', ')}.`,
          'The contribution must add a distinct question, objection, example, synthesis, useful anecdote or light humor that serves comprehension.',
          'Return only a JSON array with one type:"text" object.',
          'Include content, agentId, a stable interventionId, and interventionForm.',
          'Do not invent a learner response. Do not prefix the content with a speaker name.',
          languageDirective ? `Language directive: ${languageDirective}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        [
          `Scene id: ${outline.id}`,
          `Title: ${outline.title}`,
          `Description: ${outline.description}`,
          `Key points: ${(outline.keyPoints ?? []).join('; ')}`,
        ].join('\n'),
      );
      const repaired = processActions(
        parseActionsFromStructuredOutput(response, outline.type),
        [],
        agents,
      ).find(
        (action) =>
          action.type === 'speech' &&
          action.agentId === selectedAgent.id &&
          Boolean(action.interventionId) &&
          Boolean(action.interventionForm && INTERVENTION_FORM_SET.has(action.interventionForm)),
      );
      if (repaired) {
        coveredActions = insertBeforeDiscussion(coveredActions, repaired);
        continue;
      }
    } catch (error) {
      log.warn(
        `Prepared intervention repair failed for ${selectedAgent.id} in scene ${outline.id}:`,
        error,
      );
    }

    coveredActions = insertBeforeDiscussion(
      coveredActions,
      fallbackPreparedQuestion(outline, selectedAgent, languageDirective),
    );
  }

  return coveredActions;
}

/**
 * Generate default PBL Actions (fallback)
 */
function generateDefaultPBLActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: 'PBL 项目介绍',
      text: '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。',
    },
  ];
}

/**
 * Format element list for AI to select elementId
 */
function formatElementsForPrompt(elements: PPTElement[]): string {
  return elements
    .map((el) => {
      let summary = '';
      if (el.type === 'text' && 'content' in el) {
        // Extract text content summary (strip HTML tags)
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${summary}`;
    })
    .join('\n');
}

const VISUAL_CLAIM_RULES: Array<{
  label: string;
  pattern: RegExp;
  elementTypes: PPTElement['type'][];
}> = [
  {
    label: 'tableau',
    pattern:
      /\b(?:ce|le|un) tableau\b|\bdans (?:ce|le) tableau\b|\bthis table\b|\bthe table (?:shown|displayed)\b|هذا الجدول/iu,
    elementTypes: ['table'],
  },
  {
    label: 'graphique',
    pattern:
      /\b(?:ce|le|un) graphique\b|\bdans (?:ce|le) graphique\b|\bthis chart\b|\bthe chart (?:shown|displayed)\b|هذا الرسم البياني/iu,
    elementTypes: ['chart'],
  },
  {
    label: 'vidéo',
    pattern:
      /\b(?:cette|la|une) vidéo\b|\bthis video\b|\bthe video (?:shown|displayed)\b|هذا الفيديو/iu,
    elementTypes: ['video'],
  },
  {
    label: 'image',
    pattern:
      /\b(?:cette|une) (?:image|illustration|photo)\b|\bl['’](?:image|illustration)\b|\bthis (?:image|illustration|photo)\b|\bthe (?:image|illustration|photo) (?:shown|displayed)\b/iu,
    elementTypes: ['image'],
  },
  {
    label: 'schéma',
    pattern:
      /\b(?:ce|le|un) sch[ée]ma\b|\b(?:ce|le|un) diagramme\b|\bthis diagram\b|\bthe diagram (?:shown|displayed)\b/iu,
    // A generic source image has no semantic metadata proving that it depicts
    // the claimed structure. A demonstrative "ce schéma" therefore needs a
    // structured chart or table element.
    elementTypes: ['chart', 'table'],
  },
];

function findUngroundedVisualClaim(actions: Action[], elements: PPTElement[]): string | null {
  for (const action of actions) {
    if (action.type !== 'speech') continue;
    for (const rule of VISUAL_CLAIM_RULES) {
      if (
        rule.pattern.test(action.text) &&
        !elements.some((element) => rule.elementTypes.includes(element.type))
      ) {
        return `The narration mentions a visible ${rule.label}, but the slide element inventory contains no ${rule.elementTypes.join(' or ')} element. Offending speech: "${action.text}"`;
      }
    }
  }
  return null;
}

function findUngroundedResourceClaim(actions: Action[], resourceCount: number): string | null {
  if (resourceCount > 0) return null;
  const claimPattern =
    /\b(?:télécharg\w*|telecharg\w*|download\w*|QR\s*code|lien\s+court|short\s+link)\b|\b(?:fichier|document|workbook|worksheet)\b.{0,50}\b(?:disponible|joint|fourni|ready|available)\b/iu;
  const offending = actions.find(
    (action) => action.type === 'speech' && claimPattern.test(action.text),
  );
  return offending?.type === 'speech'
    ? `The narration promises a downloadable resource, but this scene has no generated resource. Offending speech: "${offending.text}"`
    : null;
}

export function stripVisualProductionDirectives(text: string): string {
  return text
    .replace(
      /\s*\[(?:sch[ée]ma|schema|diagram(?:me)?|image|illustration|visual)\]\s*[^.!?]*(?:[.!?](?=\s|$)|$)/giu,
      ' ',
    )
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Format question list for AI reference
 */
function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options
        ? `Options: ${q.options.map((o) => `${o.value}. ${o.label}`).join(', ')}`
        : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

/**
 * Process and validate Actions
 */
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const teacherAgent = agents?.find((agent) => agent.role === 'teacher');
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.flatMap((action) => {
    const sanitizedAction =
      action.type === 'speech'
        ? { ...action, text: stripVisualProductionDirectives(action.text) }
        : action;
    if (sanitizedAction.type === 'speech' && !sanitizedAction.text) return [];

    // Ensure each action has an ID
    const processedAction: Action = {
      ...sanitizedAction,
      id: sanitizedAction.id || `action_${nanoid(8)}`,
    };

    // A spoken line controls both the visible avatar and the synthesized voice.
    // Never let an LLM-invented identity cross that trust boundary. Legacy lines
    // without attribution inherit the configured teacher when one is available.
    if (processedAction.type === 'speech' && agents && agents.length > 0) {
      const hasValidSpeaker =
        Boolean(processedAction.agentId) && agentIds.has(processedAction.agentId!);
      if (!hasValidSpeaker) {
        processedAction.agentId = teacherAgent?.id;
        delete processedAction.interventionId;
        delete processedAction.interventionForm;
      }
    }

    // Validate spotlight elementId
    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !elementIds.has(spotlightAction.elementId)) {
        // If elementId is invalid, try selecting the first element
        if (elements.length > 0) {
          spotlightAction.elementId = elements[0].id;
          log.warn(
            `Invalid elementId, falling back to first element: ${spotlightAction.elementId}`,
          );
        }
      }
    }

    // Validate/fill discussion agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // agentId valid — keep it
      } else {
        // agentId missing or invalid — pick a random student, or non-teacher, or skip
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return [processedAction];
  });
}

/**
 * Generate default slide Actions (fallback)
 */
export function generateDefaultSlideActions(
  outline: SceneOutline,
  elements: PPTElement[],
  languageDirective?: string,
): Action[] {
  const actions: Action[] = [];
  const isArabic = /arabic|arabe|العربية|ar-MA/i.test(languageDirective ?? '');
  const isFrench = /french|français|francais|fr-FR/i.test(languageDirective ?? '');

  // Add spotlight for text elements
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: isArabic ? 'النقطة الأساسية' : isFrench ? 'Point essentiel' : 'Key point',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech based on key points
  const sentenceSeparator = isArabic ? '۔ ' : '. ';
  const sentenceEnd = isArabic ? '۔' : '.';
  const speechText = outline.keyPoints?.length
    ? `${outline.keyPoints.map((point) => point.replace(/[.!?。۔]+\s*$/u, '')).join(sentenceSeparator)}${sentenceEnd}`
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: isArabic ? 'شرح المشهد' : isFrench ? 'Explication' : 'Scene explanation',
    text: speechText,
  });

  return actions;
}

/**
 * Generate default quiz Actions (fallback)
 */
function generateDefaultQuizActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '测验引导',
      text: '现在让我们来做一个小测验，检验一下学习成果。',
    },
  ];
}

/**
 * Generate default interactive Actions (fallback)
 */
function generateDefaultInteractiveActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '交互引导',
      text: '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。',
    },
  ];
}

/**
 * Create a complete scene with Actions
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent
    | GeneratedPluginContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    // Build complete Slide object
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
        // Ultra Mode widget fields
        widgetType: content.widgetType,
        widgetConfig: content.widgetConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
        ...(content.projectV2 ? { projectV2: content.projectV2 } : {}),
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'plugin' && 'pluginType' in content) {
    const sceneResult = api.scene.create({
      type: 'plugin',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'plugin',
        pluginType: content.pluginType,
        data: content.data,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}

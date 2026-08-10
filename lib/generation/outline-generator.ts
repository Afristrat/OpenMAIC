/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  ClassroomPlan,
  ClassroomSyllabus,
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { PROMPT_IDS } from '@/lib/prompts';
import { buildPromptWithSkill } from '@/lib/skills/prompt-overrides';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { formatPluginsForPrompt, loadPlugins } from '@/lib/plugins/loader';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
import { selectSourceContext } from './source-context';
const log = createLogger('Generation');

function syllabusPlaceholder(languageDirective: string): string {
  if (/arabic|ar-MA|العربية/i.test(languageDirective)) return 'يحدده المؤلف';
  if (/french|fr-FR|français/i.test(languageDirective)) return 'À préciser par l’auteur';
  return 'To be confirmed by the author';
}

function normalizeSyllabus(
  value: unknown,
  languageDirective: string,
  courseTitle: string | undefined,
  outlines: SceneOutline[],
): ClassroomSyllabus {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const placeholder = syllabusPlaceholder(languageDirective);
  const stringValue = (key: string, fallback = placeholder) => {
    const raw = candidate[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
  };
  const objectives = Array.isArray(candidate.learningObjectives)
    ? candidate.learningObjectives.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];
  const derivedObjectives = outlines
    .map((outline) => outline.teachingObjective?.trim() || outline.title.trim())
    .filter(Boolean)
    .slice(0, 12);
  const explicitDuration = Number(candidate.totalDurationMinutes);
  const seconds = outlines.reduce((total, outline) => total + (outline.estimatedDuration ?? 0), 0);
  const derivedDuration = Math.max(1, Math.ceil(seconds / 60) || outlines.length * 3);
  const overallObjective = stringValue(
    'overallObjective',
    outlines[0]?.teachingObjective?.trim() || courseTitle || placeholder,
  );

  return {
    audience: stringValue('audience'),
    prerequisites: stringValue('prerequisites'),
    overallObjective,
    learningObjectives:
      objectives.length > 0
        ? objectives.slice(0, 12)
        : derivedObjectives.length > 0
          ? derivedObjectives
          : [overallObjective],
    totalDurationMinutes:
      Number.isInteger(explicitDuration) && explicitDuration > 0
        ? Math.min(explicitDuration, 10080)
        : derivedDuration,
    deliveryMode: stringValue('deliveryMode'),
    assessmentStrategy: stringValue('assessmentStrategy'),
    expectedDeliverable: stringValue('expectedDeliverable'),
  };
}

/**
 * Used when the outline stage fails to produce an explicit directive (LLM
 * schema regression, empty response, upstream error). Downstream prompts
 * still need *something* that steers the model toward the requirement's
 * language rather than defaulting to the training-distribution prior.
 */
export const DEFAULT_LANGUAGE_DIRECTIVE =
  'Teach in the language that matches the user requirement.';

export const SCENE_COUNT_MISMATCH_CODE = 'SCENE_COUNT_MISMATCH';

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  'dix-sept': 17,
  'dix-huit': 18,
  'dix-neuf': 19,
  vingt: 20,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  واحد: 1,
  واحدة: 1,
  اثنان: 2,
  اثنتان: 2,
  ثلاثة: 3,
  أربع: 4,
  خمسة: 5,
  ستة: 6,
  سبعة: 7,
  ثمانية: 8,
  تسعة: 9,
  عشرة: 10,
  أحدعشر: 11,
  اثناعشر: 12,
};

function parseSceneCountToken(token: string): number | undefined {
  const normalizedDigits = token.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const numeric = Number.parseInt(normalizedDigits, 10);
  if (Number.isInteger(numeric)) return numeric;
  return NUMBER_WORDS[token.toLocaleLowerCase('fr-FR')];
}

/** Extracts only an explicit author-specified number attached to a scene-like unit. */
export function extractRequestedSceneCount(requirement: string): number | undefined {
  const numberToken =
    '(?:[1-9]|[1-9][0-9]|100|[٠-٩]{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt|one|two|three|four|five|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|واحد|واحدة|اثنان|اثنتان|ثلاثة|أربع|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة|أحدعشر|اثناعشر)';
  const unit =
    '(?:diapositives?|slides?|sc[eè]nes?|s[eé]quences?|شريحة|شرائح|مشهد|مشاهد|تسلسل|تسلسلات)';
  const patterns = [
    new RegExp(`(?:exactement|exactly|pr[eé]cis[eé]ment)\\s+(${numberToken})\\s+${unit}`, 'iu'),
    new RegExp(`\\b(${numberToken})\\s+${unit}\\b`, 'iu'),
    new RegExp(`(${numberToken})\\s+${unit}`, 'iu'),
  ];

  for (const pattern of patterns) {
    const match = requirement.match(pattern);
    if (!match?.[1]) continue;
    const count = parseSceneCountToken(match[1]);
    if (count && count <= 100) return count;
  }
  return undefined;
}

export function isSceneCountMismatch(error: string | undefined): boolean {
  return error?.startsWith(`${SCENE_COUNT_MISMATCH_CODE}:`) ?? false;
}

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
    skillEngineEnabled?: boolean;
    expectedSceneCount?: number;
  },
): Promise<GenerationResult<ClassroomPlan>> {
  // Build available images description for the prompt
  let availableImagesText = 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions
      availableImagesText = pdfImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media snippet conditions based on enabled flags.
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  const mediaEnabled = imageEnabled || videoEnabled;
  const hasSourceImages = (pdfImages?.length ?? 0) > 0;

  // Use simplified prompt variables
  const prompts = buildPromptWithSkill(
    PROMPT_IDS.REQUIREMENTS_TO_OUTLINES,
    {
      // New simplified variables
      requirement: requirements.requirement,
      pdfContent: pdfText ? selectSourceContext(pdfText) : 'None',
      availableImages: availableImagesText,
      userProfile: userProfileText,
      hasSourceImages,
      imageEnabled,
      videoEnabled,
      mediaEnabled,
      researchContext: options?.researchContext || 'None',
      availablePlugins: formatPluginsForPrompt(),
      hasPlugins: loadPlugins().length > 0,
      // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
      teacherContext: options?.teacherContext || '',
    },
    {
      enabled: options?.skillEngineEnabled,
      activeSkillId: requirements.activeSkillId,
    },
  );

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const parsed = parseJsonResponse<
      | {
          languageDirective: string;
          courseTitle?: string;
          syllabus?: unknown;
          outlines: SceneOutline[];
        }
      | SceneOutline[]
    >(response);

    let languageDirective: string;
    let courseTitle: string | undefined;
    let rawSyllabus: unknown;
    let rawOutlines: SceneOutline[];

    if (Array.isArray(parsed)) {
      // Fallback: LLM returned old flat array format
      languageDirective = DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed;
    } else if (parsed && parsed.outlines) {
      languageDirective = parsed.languageDirective || DEFAULT_LANGUAGE_DIRECTIVE;
      // courseTitle is optional — only honor a non-empty string, and cap its
      // length defensively (the prompt asks for ≤30 chars, but older/hallucinating
      // models may return far more). The downstream Stage.name column is bounded too.
      const rawTitle = parsed.courseTitle;
      courseTitle =
        typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 120) : undefined;
      rawSyllabus = parsed.syllabus;
      rawOutlines = parsed.outlines;
    } else {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    if (!Array.isArray(rawOutlines)) {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    if (
      options?.expectedSceneCount !== undefined &&
      rawOutlines.length !== options.expectedSceneCount
    ) {
      return {
        success: false,
        error: `${SCENE_COUNT_MISMATCH_CODE}: requested ${options.expectedSceneCount}, received ${rawOutlines.length}`,
      };
    }

    // Ensure IDs and order
    const enriched = rawOutlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
    }));

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const result = uniquifyMediaElementIds(enriched);

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return {
      success: true,
      data: {
        languageDirective,
        courseTitle: courseTitle || syllabusPlaceholder(languageDirective),
        syllabus: normalizeSyllabus(rawSyllabus, languageDirective, courseTitle, result),
        outlines: result,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig OR widgetType+widgetOutline → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function sanitizeProceduralSkillOutline(outline: SceneOutline): SceneOutline {
  const widgetOutline = { ...(outline.widgetOutline ?? {}) };
  delete widgetOutline.procedureType;
  delete widgetOutline.task;
  delete widgetOutline.tools;
  delete widgetOutline.steps;
  delete widgetOutline.successCriteria;
  delete widgetOutline.errorConsequences;

  return {
    ...outline,
    type: 'interactive',
    widgetType: 'diagram',
    description: outline.description
      ? `${outline.description} Present this as a process or structure diagram.`
      : 'Present this topic as a process or structure diagram.',
    widgetOutline,
  };
}

export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
  options: { allowProceduralSkill?: boolean } = {},
): SceneOutline {
  // Ultra Mode: interactive scenes with widgetType + widgetOutline are valid
  const hasWidgetConfig = outline.widgetType && outline.widgetOutline;

  if (outline.widgetType === 'procedural-skill' && !options.allowProceduralSkill) {
    log.warn(`Procedural-skill outline "${outline.title}" is not enabled, falling back to diagram`);
    return sanitizeProceduralSkillOutline(outline);
  }

  if (outline.type === 'interactive' && !outline.interactiveConfig && !hasWidgetConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig and widget config, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'plugin' && !outline.pluginType) {
    log.warn(`Plugin outline "${outline.title}" missing pluginType, falling back to slide`);
    return { ...outline, type: 'slide' };
  }
  return outline;
}

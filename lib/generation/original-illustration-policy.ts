import type { MediaGenerationRequest } from '@/lib/media/types';
import type { SceneOutline } from '@/lib/types/generation';

type CourseLanguage = 'fr' | 'en' | 'ar';

/**
 * Consigne d'originalité puis langue du texte visible dans l'image, écrites dans la langue du
 * cours : le prompt est lu par l'auteur dans le syllabus à valider, et la langue du prompt
 * pilote celle des libellés que le modèle d'image dessine.
 */
const ORIGINAL_IMAGE_DIRECTIVE: Record<CourseLanguage, string> = {
  en: 'Create a new original explanatory illustration. Do not reproduce, trace, imitate, or reuse any image from the supplied documents.',
  fr: 'Crée une illustration pédagogique originale et nouvelle. Ne reproduis, ne décalque, n’imite et ne réutilise aucune image des documents fournis.',
  ar: 'أنشئ رسماً توضيحياً تعليمياً جديداً وأصلياً. لا تنسخ ولا تتتبّع ولا تقلّد ولا تعد استخدام أي صورة من الوثائق المقدَّمة.',
};

const IMAGE_TEXT_LANGUAGE: Record<CourseLanguage, string> = {
  en: 'Any text visible in the image is in English.',
  fr: 'Tout texte visible dans l’image est en français.',
  ar: 'كل نص ظاهر في الصورة يكون بالعربية.',
};

// Jamais « fr », « en » ou « ar » seuls : « en français » contient le mot « en ».
const LANGUAGE_WORDS: Record<CourseLanguage, RegExp> = {
  fr: /\b(?:fr[-_]fr|français|francais|french)\b/iu,
  en: /\b(?:en[-_](?:us|gb)|anglais|english)\b/iu,
  ar: /\b(?:ar[-_]ma|arabe|arabic)\b|العربية/iu,
};

/**
 * Langue d'enseignement d'une consigne de langue : la première langue citée l'emporte, car
 * « Deliver the course in English, keep French legal terms » parle anglais malgré le mot French.
 * Anglais par défaut quand rien n'est reconnu (comportement historique).
 */
function courseLanguage(languageDirective?: string): CourseLanguage {
  let best: { language: CourseLanguage; index: number } | undefined;
  for (const language of Object.keys(LANGUAGE_WORDS) as CourseLanguage[]) {
    const index = languageDirective?.search(LANGUAGE_WORDS[language]) ?? -1;
    if (index >= 0 && (!best || index < best.index)) best = { language, index };
  }
  return best?.language ?? 'en';
}

function originalPrompt(prompt: string, language: CourseLanguage): string {
  let body = prompt.trim();
  // Un plan déjà enregistré porte l'ancienne consigne (anglaise) : on la remplace, une seule fois.
  for (const known of Object.values(ORIGINAL_IMAGE_DIRECTIVE)) {
    if (body.startsWith(known)) body = body.slice(known.length).trim();
  }
  for (const known of Object.values(IMAGE_TEXT_LANGUAGE)) {
    if (body.startsWith(known)) body = body.slice(known.length).trim();
  }
  return `${ORIGINAL_IMAGE_DIRECTIVE[language]} ${IMAGE_TEXT_LANGUAGE[language]} ${body}`.trim();
}

function generatedImageId(outline: SceneOutline): string {
  const safeOutlineId = outline.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'scene';
  return `gen_img_original_${safeOutlineId}`;
}

function inferredIllustrationBody(outline: SceneOutline, language: CourseLanguage): string {
  const focus = (outline.keyPoints ?? []).join('; ');
  if (language === 'fr') {
    return (
      `Illustre l’idée pédagogique unique de « ${outline.title} » : ${outline.description}. ` +
      `Appuie-toi sur ces points : ${focus}. Évite le texte sauf s’il est indispensable.`
    );
  }
  if (language === 'ar') {
    return (
      `ارسم الفكرة التعليمية الوحيدة لـ «${outline.title}»: ${outline.description}. ` +
      `اعتمد على هذه النقاط: ${focus}. تجنّب النص ما لم يكن ضرورياً.`
    );
  }
  return (
    `Illustrate the single teaching idea of “${outline.title}”: ${outline.description}. ` +
    `Use this learning focus: ${focus}. Avoid text unless indispensable.`
  );
}

function inferredIllustration(
  outline: SceneOutline,
  language: CourseLanguage,
): MediaGenerationRequest {
  return {
    type: 'image',
    elementId: generatedImageId(outline),
    aspectRatio: '16:9',
    prompt: originalPrompt(inferredIllustrationBody(outline, language), language),
  };
}

/**
 * Source images may inform document analysis but never enter the classroom canvas.
 * Existing synthetic-image requests are hardened; a source-image suggestion is
 * converted into one original illustration request when image generation is enabled.
 */
export function enforceOriginalIllustrations(
  outlines: readonly SceneOutline[],
  imageGenerationEnabled: boolean,
  languageDirective?: string,
): SceneOutline[] {
  const language = courseLanguage(languageDirective);
  return outlines.map((outline) => {
    const sourceImageWasSuggested = (outline.suggestedImageIds?.length ?? 0) > 0;
    const mediaGenerations = (outline.mediaGenerations ?? []).map((request) =>
      request.type === 'image'
        ? { ...request, prompt: originalPrompt(request.prompt, language) }
        : request,
    );
    if (
      imageGenerationEnabled &&
      sourceImageWasSuggested &&
      !mediaGenerations.some((request) => request.type === 'image')
    ) {
      mediaGenerations.push(inferredIllustration(outline, language));
    }

    const { suggestedImageIds: _sourceImages, ...withoutSourceImages } = outline;
    return {
      ...withoutSourceImages,
      ...(mediaGenerations.length > 0 ? { mediaGenerations } : {}),
    } as SceneOutline;
  });
}

export function isGeneratedIllustrationUrl(elementId: string, url: string): boolean {
  return url.startsWith(`/api/classroom-media/`) && url.includes(`/media/${elementId}.`);
}

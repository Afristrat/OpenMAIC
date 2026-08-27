import type { MediaGenerationRequest } from '@/lib/media/types';
import type { SceneOutline } from '@/lib/types/generation';

const ORIGINAL_IMAGE_DIRECTIVE =
  'Create a new original explanatory illustration. Do not reproduce, trace, imitate, or reuse any image from the supplied documents.';

function originalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.startsWith(ORIGINAL_IMAGE_DIRECTIVE)) {
    return trimmed;
  }
  return `${ORIGINAL_IMAGE_DIRECTIVE} ${trimmed}`.trim();
}

function generatedImageId(outline: SceneOutline): string {
  const safeOutlineId = outline.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'scene';
  return `gen_img_original_${safeOutlineId}`;
}

function inferredIllustration(outline: SceneOutline): MediaGenerationRequest {
  return {
    type: 'image',
    elementId: generatedImageId(outline),
    aspectRatio: '16:9',
    prompt: originalPrompt(
      `Illustrate the single teaching idea of “${outline.title}”: ${outline.description}. ` +
        `Use this learning focus: ${(outline.keyPoints ?? []).join('; ')}. Avoid text unless indispensable.`,
    ),
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
): SceneOutline[] {
  return outlines.map((outline) => {
    const sourceImageWasSuggested = (outline.suggestedImageIds?.length ?? 0) > 0;
    const mediaGenerations = (outline.mediaGenerations ?? []).map((request) =>
      request.type === 'image' ? { ...request, prompt: originalPrompt(request.prompt) } : request,
    );
    if (
      imageGenerationEnabled &&
      sourceImageWasSuggested &&
      !mediaGenerations.some((request) => request.type === 'image')
    ) {
      mediaGenerations.push(inferredIllustration(outline));
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

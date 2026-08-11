import type { SceneOutline } from '@/lib/types/generation';
import type { MediaGenerationRequest } from '@/lib/media/types';

function canRenderGeneratedMedia(outline: SceneOutline): boolean {
  return (
    outline.type === 'slide' &&
    !outline.resourceGenerations?.length &&
    !outline.generatedResources?.length
  );
}

/**
 * Generated media can only be backfilled into an ordinary slide canvas.
 * Move requests emitted on quizzes, widgets, projects, plug-ins, or dedicated
 * resource slides to the nearest compatible slide instead of generating an
 * orphaned file that makes the whole classroom fail after all scenes exist.
 */
export function placeGeneratedMediaOnSlides(outlines: SceneOutline[]): SceneOutline[] {
  const targetIndexes = outlines.flatMap((outline, index) =>
    canRenderGeneratedMedia(outline) ? [index] : [],
  );
  if (targetIndexes.length === 0) {
    return outlines.map((outline) => {
      if (!outline.mediaGenerations?.length) return outline;
      const { mediaGenerations: _removed, ...withoutMedia } = outline;
      return withoutMedia as SceneOutline;
    });
  }

  const relocated = new Map<number, MediaGenerationRequest[]>();
  const normalized: SceneOutline[] = outlines.map((outline, sourceIndex) => {
    if (canRenderGeneratedMedia(outline) || !outline.mediaGenerations?.length) return outline;

    const targetIndex = targetIndexes.reduce((best, candidate) =>
      Math.abs(candidate - sourceIndex) < Math.abs(best - sourceIndex) ? candidate : best,
    );
    relocated.set(targetIndex, [
      ...(relocated.get(targetIndex) ?? []),
      ...outline.mediaGenerations,
    ]);
    const { mediaGenerations: _removed, ...withoutMedia } = outline;
    return withoutMedia as SceneOutline;
  });

  return normalized.map((outline, index) => {
    const additions = relocated.get(index);
    if (!additions?.length) return outline;
    return {
      ...outline,
      mediaGenerations: [...(outline.mediaGenerations ?? []), ...additions],
    };
  });
}

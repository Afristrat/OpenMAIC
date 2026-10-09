import type { Stage } from '@openmaic/dsl';
import type { SceneOutline } from '@/lib/types/generation';
import { buildPalette, normalizeDesignDirective } from './design-directive';

export type AdaptiveSlideType = 'cover' | 'contents' | 'transition' | 'content' | 'end';

function inferSlideType(
  outline: SceneOutline,
  courseOutlines: readonly SceneOutline[] = [],
): AdaptiveSlideType {
  const orderedSlides = courseOutlines
    .filter((item) => item.type === 'slide')
    .sort((left, right) => left.order - right.order);
  const slideIndex = orderedSlides.findIndex((item) => item.id === outline.id);
  if (slideIndex === 0) return 'cover';
  if (slideIndex >= 0 && slideIndex === orderedSlides.length - 1) return 'end';

  const normalizedText = `${outline.title} ${outline.description}`.toLowerCase();
  if (
    /\b(agenda|contents|objectives|objectifs|programme|program|sommaire|plan)\b/u.test(
      normalizedText,
    )
  ) {
    return 'contents';
  }
  if (/\b(chapter|section|module|partie|chapitre|transition)\b/u.test(normalizedText)) {
    return 'transition';
  }
  return 'content';
}

export function buildSlideDesignPromptContext(input: {
  outline: SceneOutline;
  courseOutlines?: readonly SceneOutline[];
  designDirective?: Stage['designDirective'];
  brandSnapshot?: Stage['brandSnapshot'];
}): {
  designSystemEnabled: boolean;
  slideType: AdaptiveSlideType;
  designDirectiveContext: string;
  brandSnapshotContext: string;
  warnings: string[];
} {
  const hasSnapshot = input.brandSnapshot?.version === 1 && Boolean(input.brandSnapshot.content);
  const hasDirective = Boolean(input.designDirective);
  const normalized = hasDirective ? normalizeDesignDirective(input.designDirective) : undefined;
  const directiveContext = normalized
    ? JSON.stringify({
        directive: normalized.directive,
        palette: buildPalette(normalized.directive),
      })
    : 'No course directive supplied.';

  return {
    designSystemEnabled: hasSnapshot || hasDirective,
    slideType: inferSlideType(input.outline, input.courseOutlines),
    designDirectiveContext: directiveContext,
    brandSnapshotContext: hasSnapshot
      ? JSON.stringify({ version: 1, content: input.brandSnapshot?.content.slice(0, 1200) })
      : 'No tenant brand snapshot supplied.',
    warnings: normalized?.warnings ?? [],
  };
}

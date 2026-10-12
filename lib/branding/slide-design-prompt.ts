import type { Stage } from '@openmaic/dsl';
import type { SceneOutline } from '@/lib/types/generation';
import {
  buildPalette,
  normalizeDesignDirective,
  resolveSlideSurface,
  type SlideSurface,
} from './design-directive';

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
  /** Surface the platform imposes for this slide (brief §3.6); undefined without a design system. */
  surface: SlideSurface | undefined;
  surfaceContext: string;
  /** Horizontal safe margin enforced by the adaptive linter (R-SAFE-AREA). */
  safeMargin: number;
  warnings: string[];
} {
  const hasSnapshot = input.brandSnapshot?.version === 1 && Boolean(input.brandSnapshot.content);
  const hasDirective = Boolean(input.designDirective);
  const normalized = hasDirective ? normalizeDesignDirective(input.designDirective) : undefined;
  // Same fallback as the linter, which normalizes an absent directive to the default.
  const safeMargin = (normalized ?? normalizeDesignDirective(undefined)).directive.grid.margin;
  const directiveContext = normalized
    ? JSON.stringify({
        directive: normalized.directive,
        palette: buildPalette(normalized.directive),
      })
    : 'No course directive supplied.';

  const slideType = inferSlideType(input.outline, input.courseOutlines);
  const surface =
    hasSnapshot || hasDirective
      ? resolveSlideSurface(
          slideType,
          (normalized ?? normalizeDesignDirective(undefined)).directive,
          input.brandSnapshot,
        )
      : undefined;

  return {
    designSystemEnabled: hasSnapshot || hasDirective,
    slideType,
    surface,
    surfaceContext: surface
      ? `Slide surface fixed by the platform (do not change it): ${surface.role} ${surface.color}. On it use text ${surface.text}, secondary text ${surface.textSecondary}, accent ${surface.accent}. Cards: fill ${surface.card} with opacity ${surface.cardOpacity}. Banners: fill ${surface.band} with text ${surface.bandText} only. The platform renders the background: set \`background\` to this solid colour.`
      : '',
    designDirectiveContext: directiveContext,
    brandSnapshotContext: hasSnapshot
      ? JSON.stringify({ version: 1, content: input.brandSnapshot?.content.slice(0, 1200) })
      : 'No tenant brand snapshot supplied.',
    safeMargin,
    warnings: normalized?.warnings ?? [],
  };
}

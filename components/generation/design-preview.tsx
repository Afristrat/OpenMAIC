'use client';

import type { CSSProperties } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  buildPalette,
  type BrandColors,
  type DesignDirective,
} from '@/lib/branding/design-directive';

const SERIF_FONTS = new Set(['Merriweather', 'Literata', 'Source Serif 4']);

function fontStack(font: string): string {
  const fallback = SERIF_FONTS.has(font)
    ? 'serif'
    : font === 'JetBrains Mono'
      ? 'monospace'
      : 'system-ui, sans-serif';
  return `"${font}", ${fallback}`;
}

const PADDING: Record<DesignDirective['density'], number> = { compact: 8, balanced: 12, airy: 18 };

interface DesignPreviewProps {
  directive: DesignDirective;
  /** The tenant charter colours: when present they decide the palette, as in the generation. */
  brandColors?: BrandColors;
  courseTitle: string;
  sampleTitle: string;
  samplePoints: string[];
}

/**
 * Four miniature slides drawn from the same palette, fonts, radius and density the
 * generator will use, so the author can judge the theme before approving the plan.
 */
export function DesignPreview({
  directive,
  brandColors,
  courseTitle,
  sampleTitle,
  samplePoints,
}: DesignPreviewProps) {
  const { t } = useI18n();
  const palette = buildPalette(directive, undefined, brandColors);
  const padding = PADDING[directive.density];
  const radius = directive.shapes.radius;
  const border =
    directive.shapes.stroke === 'hairline' ? `1px solid ${palette['border.hairline']}` : 'none';
  const heading = fontStack(directive.typography.heading);
  const body = fontStack(directive.typography.body);

  const slide = (background: string): CSSProperties => ({
    background,
    padding,
    borderRadius: radius,
    border,
    fontFamily: body,
  });
  const points = samplePoints.slice(0, 3);

  return (
    <div data-testid="design-preview" className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('generation.designPreview')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <figure className="space-y-1">
          <div
            className="flex aspect-video flex-col justify-end"
            style={slide(palette['surface.dark'])}
          >
            <div
              className="mb-2 h-0.5 w-8"
              style={{ background: palette['accent.onDark'] }}
              aria-hidden
            />
            <p
              className="line-clamp-3 text-[13px] font-semibold leading-tight"
              style={{ color: palette['text.onDark'], fontFamily: heading }}
            >
              {courseTitle}
            </p>
          </div>
          <figcaption className="text-[11px] text-muted-foreground">
            {t('generation.designPreviewCover')}
          </figcaption>
        </figure>

        <figure className="space-y-1">
          <div className="aspect-video space-y-1.5" style={slide(palette['surface.base'])}>
            <p
              className="line-clamp-2 text-[12px] font-semibold leading-tight"
              style={{ color: palette['text.primary'], fontFamily: heading }}
            >
              {sampleTitle}
            </p>
            <div
              className="h-0.5 w-6"
              style={{ background: palette['accent.primary'] }}
              aria-hidden
            />
            <ul className="space-y-0.5">
              {points.map((point) => (
                <li
                  key={point}
                  className="line-clamp-1 text-[10px]"
                  style={{ color: palette['text.secondary'] }}
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="text-[11px] text-muted-foreground">
            {t('generation.designPreviewContent')}
          </figcaption>
        </figure>

        <figure className="space-y-1">
          <div
            className="flex aspect-video flex-col justify-center"
            style={slide(palette['surface.tint'])}
          >
            <span
              className="text-2xl font-bold leading-none"
              style={{ color: palette['accent.primary'], fontFamily: heading }}
            >
              02
            </span>
            <p
              className="mt-1 line-clamp-2 text-[12px] font-semibold"
              style={{ color: palette['text.primary'], fontFamily: heading }}
            >
              {sampleTitle}
            </p>
          </div>
          <figcaption className="text-[11px] text-muted-foreground">
            {t('generation.designPreviewTransition')}
          </figcaption>
        </figure>

        <figure className="space-y-1">
          <div
            className="flex aspect-video flex-col justify-center gap-1.5"
            style={slide(palette['surface.dark'])}
          >
            <p
              className="text-[12px] font-semibold"
              style={{ color: palette['text.onDark'], fontFamily: heading }}
            >
              {t('generation.designPreviewThanks')}
            </p>
            <span
              className="inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: palette['accent.achievement'], color: palette['text.onDark'] }}
            >
              {t('generation.designPreviewAchievement')}
            </span>
          </div>
          <figcaption className="text-[11px] text-muted-foreground">
            {t('generation.designPreviewClosing')}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

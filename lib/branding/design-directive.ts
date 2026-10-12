import { z } from 'zod/v4';
import tinycolor from 'tinycolor2';
import {
  DESIGN_DENSITIES,
  DESIGN_FONTS,
  DESIGN_HUE_FAMILIES,
  DESIGN_TONES,
  type DesignDirective,
  type SlideBackground,
  type SlideTheme,
} from '@openmaic/dsl';

export { DESIGN_DENSITIES, DESIGN_FONTS, DESIGN_HUE_FAMILIES, DESIGN_TONES };

/** Free-text guidance given to the slide engine: long enough to be a real brief. */
export const DESIGN_NOTES_MAX_LENGTH = 1200;
export const DESIGN_FORBIDDEN_MAX_ENTRIES = 8;
export const DESIGN_FORBIDDEN_MAX_LENGTH = 140;
export type { DesignDirective };

export const designDirectiveSchema = z
  .object({
    version: z.literal(1),
    source: z.enum(['charter', 'derived']),
    tone: z.enum(DESIGN_TONES),
    density: z.enum(DESIGN_DENSITIES),
    seed: z
      .object({
        hueFamily: z.enum(DESIGN_HUE_FAMILIES),
        chromaLevel: z.enum(['low', 'mid']),
      })
      .strict(),
    palette: z.null(),
    typography: z
      .object({
        heading: z.enum(DESIGN_FONTS),
        body: z.enum(DESIGN_FONTS),
        scaleShift: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      })
      .strict(),
    grid: z.object({ margin: z.number().int().min(64).max(80) }).strict(),
    shapes: z
      .object({
        radius: z.number().int().min(0).max(24),
        stroke: z.enum(['none', 'hairline']),
      })
      .strict(),
    surfacePlan: z
      .object({
        content: z.enum(['base', 'tint']),
        engagement: z.enum(['dark', 'tint']),
        punchline: z.enum(['gradient', 'solid', 'none']),
      })
      .strict(),
    accentSequence: z.enum(['primary-then-achievement', 'primary-only']),
    forbidden: z
      .array(z.string().trim().min(1).max(DESIGN_FORBIDDEN_MAX_LENGTH))
      .max(DESIGN_FORBIDDEN_MAX_ENTRIES),
    notes: z.string().trim().max(DESIGN_NOTES_MAX_LENGTH),
  })
  .strict();

export interface DesignDirectiveNormalization {
  directive: DesignDirective;
  warnings: string[];
}

export const DEFAULT_DESIGN_DIRECTIVE: DesignDirective = {
  version: 1,
  source: 'derived',
  tone: 'sober',
  density: 'balanced',
  seed: { hueFamily: 'teal', chromaLevel: 'low' },
  palette: null,
  typography: { heading: 'Inter', body: 'Inter', scaleShift: 0 },
  grid: { margin: 72 },
  shapes: { radius: 0, stroke: 'none' },
  surfacePlan: { content: 'tint', engagement: 'dark', punchline: 'none' },
  accentSequence: 'primary-only',
  forbidden: [],
  notes: '',
};

/** Per-organization opt-in stored in the existing settings JSON; absent means off. */
export function isDesignSystemV1Enabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const featureSettings = (settings as Record<string, unknown>).features;
  if (!featureSettings || typeof featureSettings !== 'object' || Array.isArray(featureSettings)) {
    return false;
  }
  return (featureSettings as Record<string, unknown>).design_system_v1 === true;
}

const MAX_SERIALIZED_DIRECTIVE_LENGTH = 3_500;

/** Cuts at a word boundary (never mid-word) and ends with an ellipsis; a text with no usable space is hard-cut. */
export function clampAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, max - 1);
  const boundary = /\s/.test(trimmed.charAt(max - 1)) ? head.length : head.search(/\s\S*$/);
  if (boundary < max / 2) return trimmed.slice(0, max);
  return `${head.slice(0, boundary).replace(/[\s,;:.-]+$/, '')}…`;
}

/**
 * `notes` and `forbidden` are advisory free text: a model that is merely too
 * wordy there must not cost the whole directive (it used to fall back to the
 * neutral default). Bound them first; structural fields stay strictly validated.
 */
function boundAdvisoryText(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = { ...(value as Record<string, unknown>) };
  if (typeof candidate.notes === 'string')
    candidate.notes = clampAtWord(candidate.notes, DESIGN_NOTES_MAX_LENGTH);
  if (Array.isArray(candidate.forbidden)) {
    candidate.forbidden = candidate.forbidden
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => clampAtWord(entry, DESIGN_FORBIDDEN_MAX_LENGTH))
      .filter((entry) => entry.length > 0)
      .slice(0, DESIGN_FORBIDDEN_MAX_ENTRIES);
  }
  return candidate;
}

export function normalizeDesignDirective(value: unknown): DesignDirectiveNormalization {
  const parsed = designDirectiveSchema.safeParse(boundAdvisoryText(value));
  if (!parsed.success) {
    return {
      directive: DEFAULT_DESIGN_DIRECTIVE,
      warnings: parsed.error.issues.map(
        (issue) => `designDirective.${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }

  const directive: DesignDirective = {
    ...parsed.data,
    forbidden: parsed.data.forbidden.map((entry) => entry.trim()),
    notes: parsed.data.notes.trim(),
  };
  if (JSON.stringify(directive).length <= MAX_SERIALIZED_DIRECTIVE_LENGTH) {
    return { directive, warnings: [] };
  }

  const bounded: DesignDirective = {
    ...directive,
    forbidden: directive.forbidden.slice(0, 4).map((entry) => clampAtWord(entry, 80)),
    notes: clampAtWord(directive.notes, 600),
  };
  if (JSON.stringify(bounded).length <= MAX_SERIALIZED_DIRECTIVE_LENGTH) {
    return { directive: bounded, warnings: ['designDirective was truncated to 3,500 characters'] };
  }
  return {
    directive: DEFAULT_DESIGN_DIRECTIVE,
    warnings: ['designDirective exceeded 3,500 characters'],
  };
}

export type DesignPalette = Record<
  | 'surface.base'
  | 'surface.tint'
  | 'surface.dark'
  | 'surface.card.onBase'
  | 'surface.card.onTint'
  | 'surface.card.onDark'
  | 'text.primary'
  | 'text.secondary'
  | 'text.onDark'
  | 'text.onDark.secondary'
  | 'accent.primary'
  | 'accent.secondary'
  | 'accent.achievement'
  | 'accent.onDark'
  | 'border.hairline'
  | 'functional.correct'
  | 'functional.incorrect'
  | 'functional.warning'
  | 'functional.info',
  string
>;

const HUE_DEGREES: Record<(typeof DESIGN_HUE_FAMILIES)[number], number> = {
  red: 8,
  orange: 32,
  yellow: 58,
  green: 138,
  teal: 178,
  blue: 224,
  indigo: 252,
  violet: 280,
  magenta: 322,
  neutral: 224,
};

function hex(color: tinycolor.Instance): string {
  return color.toHexString().toUpperCase();
}

function textColorOnLight(
  seed: tinycolor.Instance,
  backgrounds: tinycolor.Instance[],
  target = 4.5,
): string {
  let candidate = seed;
  for (let step = 0; step < 50; step += 1) {
    if (backgrounds.every((background) => tinycolor.readability(candidate, background) >= target)) {
      return hex(candidate);
    }
    candidate = candidate.darken(2);
  }
  return '#111827';
}

function textColorOnDark(seed: tinycolor.Instance, background: tinycolor.Instance): string {
  let candidate = seed;
  for (let step = 0; step < 50; step += 1) {
    if (tinycolor.readability(candidate, background) >= 4.5) return hex(candidate);
    candidate = candidate.lighten(2);
  }
  return '#FFFFFF';
}

/**
 * Share of the accent colour kept when it is laid over white: the transparency rate of the
 * pastel surfaces. The base wash is barely tinted, the tint is visibly turquoise or sky blue.
 */
export const SURFACE_WASH_ALPHA = { base: 0.14, tint: 0.27 } as const;

/** Opacity of the white cards laid on a light surface, so the pastel shows through. */
export const LIGHT_CARD_OPACITY = 0.72;

function wash(accent: tinycolor.Instance, alpha: number): tinycolor.Instance {
  return tinycolor.mix('#FFFFFF', accent, alpha * 100);
}

export function buildPalette(directive: Pick<DesignDirective, 'seed' | 'tone'>): DesignPalette {
  const hue = HUE_DEGREES[directive.seed.hueFamily];
  const mid = directive.seed.chromaLevel === 'mid';
  const washSeed = tinycolor({ h: hue, s: mid ? 70 : 48, l: 50 });
  const base = wash(washSeed, SURFACE_WASH_ALPHA.base);
  const tint = wash(washSeed, SURFACE_WASH_ALPHA.tint);
  const dark = tinycolor({ h: hue, s: mid ? 48 : 38, l: 20 });
  const lightSurfaces = [base, tint];
  const primaryCandidate = tinycolor({ h: hue, s: mid ? 66 : 52, l: 34 });
  const secondaryCandidate = tinycolor({ h: (hue + 27) % 360, s: mid ? 58 : 46, l: 36 });
  const achievementCandidate = tinycolor({ h: (hue + 324) % 360, s: mid ? 56 : 44, l: 32 });
  const onDark = wash(washSeed, 0.1);

  return {
    'surface.base': hex(base),
    'surface.tint': hex(tint),
    'surface.dark': hex(dark),
    'surface.card.onBase': '#FFFFFF',
    'surface.card.onTint': '#FFFFFF',
    'surface.card.onDark': hex(tinycolor({ h: hue, s: mid ? 44 : 36, l: 28 })),
    'text.primary': textColorOnLight(tinycolor({ h: hue, s: 38, l: 13 }), lightSurfaces, 7),
    'text.secondary': textColorOnLight(tinycolor({ h: hue, s: 24, l: 30 }), lightSurfaces, 5.5),
    'text.onDark': '#FFFFFF',
    'text.onDark.secondary': textColorOnDark(onDark, dark),
    'accent.primary': textColorOnLight(primaryCandidate, lightSurfaces),
    'accent.secondary': textColorOnLight(secondaryCandidate, lightSurfaces),
    'accent.achievement': textColorOnLight(achievementCandidate, lightSurfaces),
    'accent.onDark': textColorOnDark(wash(washSeed, 0.55), dark),
    'border.hairline': hex(wash(washSeed, 0.4)),
    'functional.correct': textColorOnLight(tinycolor('#176B3A'), lightSurfaces),
    'functional.incorrect': textColorOnLight(tinycolor('#A12828'), lightSurfaces),
    'functional.warning': textColorOnLight(tinycolor('#805000'), lightSurfaces),
    'functional.info': textColorOnLight(tinycolor('#155B8A'), lightSurfaces),
  };
}

export type SlideSurfaceRole = 'base' | 'tint' | 'dark';
export type SlideFunction = 'cover' | 'contents' | 'transition' | 'content' | 'end';

export interface SlideSurface {
  role: SlideSurfaceRole;
  /** Solid colour of the surface, applied as is by the platform. */
  color: string;
  text: string;
  textSecondary: string;
  accent: string;
  card: string;
  /** Opacity of the cards on this surface: the pastel shows through on light surfaces. */
  cardOpacity: number;
  /** Fill of the banners (bandeaux) and the colour of the text laid on them. */
  band: string;
  bandText: string;
}

/**
 * Brief §3.6: the platform, not the model, decides which surface a slide sits on, from its
 * function and the course `surfacePlan`. A model otherwise answers every slide with plain white.
 * The tenant background wins for the base role; tint and dark are derived for the roles the
 * charter does not define.
 */
export function resolveSlideSurface(
  slideFunction: SlideFunction,
  directive: DesignDirective,
  brandSnapshot?: import('@openmaic/dsl').Stage['brandSnapshot'],
): SlideSurface {
  const palette = buildPalette(directive);
  const brand = snapshotDesignTokens(brandSnapshot).colors;
  const plan = directive.surfacePlan;
  const role: SlideSurfaceRole =
    slideFunction === 'cover'
      ? 'tint'
      : slideFunction === 'contents' || slideFunction === 'content'
        ? plan.content
        : plan.engagement;
  if (role === 'dark') {
    return {
      role,
      color: palette['surface.dark'],
      text: palette['text.onDark'],
      textSecondary: palette['text.onDark.secondary'],
      accent: palette['accent.onDark'],
      card: palette['surface.card.onDark'],
      cardOpacity: 1,
      band: palette['surface.card.onDark'],
      bandText: palette['text.onDark'],
    };
  }
  return {
    role,
    color:
      role === 'tint' ? palette['surface.tint'] : (brandPaper(brand) ?? palette['surface.base']),
    text: brand.ink ?? palette['text.primary'],
    textSecondary: palette['text.secondary'],
    accent: brand.accent ?? palette['accent.primary'],
    card: role === 'tint' ? palette['surface.card.onTint'] : palette['surface.card.onBase'],
    cardOpacity: LIGHT_CARD_OPACITY,
    band: palette['surface.dark'],
    bandText: palette['text.onDark'],
  };
}

/** Background the platform imposes for a surface: always solid (brief §3.8, a gradient is reserved to one punchline per deck). */
export function buildSurfaceBackground(surface: SlideSurface): SlideBackground {
  return { type: 'solid', color: surface.color };
}

/** Neutral Qalem theme for opted-in courses that have no tenant charter. */
function snapshotDesignTokens(
  snapshot: import('@openmaic/dsl').Stage['brandSnapshot'] | undefined,
): { colors: Record<string, string>; fontName?: string } {
  if (snapshot?.version !== 1 || !snapshot.content) return { colors: {} };
  const colorLine = snapshot.content.match(/(?:^|\n)colors:\s*([^\n]*)/u)?.[1] ?? '';
  const colors: Record<string, string> = {};
  for (const match of colorLine.matchAll(
    /\b(background|surface|ink|accent|muted|secondary)=(#[\da-fA-F]{6})\b/gu,
  )) {
    colors[match[1]] = match[2].toUpperCase();
  }
  const requestedFont = snapshot.content.match(/(?:^|\n)fonts:\s*display=([^;\n]+)/u)?.[1]?.trim();
  const fontName = DESIGN_FONTS.find((font) => font.toLowerCase() === requestedFont?.toLowerCase());
  return { colors, ...(fontName ? { fontName } : {}) };
}

/**
 * A (near-)white or grey brand background carries no colour decision, typically a site
 * extracted by default: the pastel wash of the palette replaces it. A coloured brand
 * background is a deliberate choice and always wins.
 */
function brandPaper(colors: Record<string, string>): string | undefined {
  const candidate = colors.background ?? colors.surface;
  if (!candidate) return undefined;
  const { s, l } = tinycolor(candidate).toHsl();
  return s < 0.12 && l > 0.9 ? undefined : candidate;
}

export function buildSlideTheme(
  directive?: DesignDirective,
  brandSnapshot?: import('@openmaic/dsl').Stage['brandSnapshot'],
): SlideTheme {
  const selected = directive ?? DEFAULT_DESIGN_DIRECTIVE;
  const palette = buildPalette(selected);
  const brand = snapshotDesignTokens(brandSnapshot);
  const colors = brand.colors ?? {};
  const themeColors = [
    colors.accent ?? palette['accent.primary'],
    colors.secondary ?? palette['accent.secondary'],
    palette['accent.achievement'],
    palette['functional.correct'],
    palette['functional.incorrect'],
  ];
  return {
    backgroundColor: brandPaper(colors) ?? palette['surface.base'],
    themeColors: [...new Set(themeColors)],
    fontColor: colors.ink ?? palette['text.primary'],
    fontName: brand.fontName ?? selected.typography.heading,
    outline: { color: palette['border.hairline'], width: 1, style: 'solid' },
    shadow: { h: 0, v: 0, blur: 0, color: '#000000' },
  };
}

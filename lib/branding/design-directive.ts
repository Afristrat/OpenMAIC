import { z } from 'zod/v4';
import tinycolor from 'tinycolor2';
import {
  DESIGN_DENSITIES,
  DESIGN_FONTS,
  DESIGN_HUE_FAMILIES,
  DESIGN_TONES,
  type DesignDirective,
} from '@openmaic/dsl';

export { DESIGN_DENSITIES, DESIGN_FONTS, DESIGN_HUE_FAMILIES, DESIGN_TONES };
export type { DesignDirective };

export const designDirectiveSchema = z
  .object({
    version: z.literal(1),
    source: z.enum(['charter', 'derived']),
    tone: z.enum(DESIGN_TONES),
    density: z.enum(DESIGN_DENSITIES),
    seed: z.object({
      hueFamily: z.enum(DESIGN_HUE_FAMILIES),
      chromaLevel: z.enum(['low', 'mid']),
    }).strict(),
    palette: z.null(),
    typography: z.object({
      heading: z.enum(DESIGN_FONTS),
      body: z.enum(DESIGN_FONTS),
      scaleShift: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    }).strict(),
    grid: z.object({ margin: z.number().int().min(64).max(80) }).strict(),
    shapes: z.object({
      radius: z.number().int().min(0).max(24),
      stroke: z.enum(['none', 'hairline']),
    }).strict(),
    surfacePlan: z.object({
      content: z.enum(['base', 'tint']),
      engagement: z.enum(['dark', 'tint']),
      punchline: z.enum(['gradient', 'solid', 'none']),
    }).strict(),
    accentSequence: z.enum(['primary-then-achievement', 'primary-only']),
    forbidden: z.array(z.string().trim().min(1).max(60)).max(3),
    notes: z.string().trim().max(100),
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
  seed: { hueFamily: 'neutral', chromaLevel: 'low' },
  palette: null,
  typography: { heading: 'Inter', body: 'Inter', scaleShift: 0 },
  grid: { margin: 72 },
  shapes: { radius: 0, stroke: 'none' },
  surfacePlan: { content: 'base', engagement: 'tint', punchline: 'none' },
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

const MAX_SERIALIZED_DIRECTIVE_LENGTH = 1_000;

export function normalizeDesignDirective(value: unknown): DesignDirectiveNormalization {
  const parsed = designDirectiveSchema.safeParse(value);
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
    forbidden: directive.forbidden.slice(0, 2).map((entry) => entry.slice(0, 36)),
    notes: directive.notes.slice(0, 48),
  };
  if (JSON.stringify(bounded).length <= MAX_SERIALIZED_DIRECTIVE_LENGTH) {
    return { directive: bounded, warnings: ['designDirective was truncated to 1,000 characters'] };
  }
  return { directive: DEFAULT_DESIGN_DIRECTIVE, warnings: ['designDirective exceeded 1,000 characters'] };
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

function textColorOnLight(seed: tinycolor.Instance, backgrounds: tinycolor.Instance[]): string {
  let candidate = seed;
  for (let step = 0; step < 50; step += 1) {
    if (backgrounds.every((background) => tinycolor.readability(candidate, background) >= 4.5)) {
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

export function buildPalette(directive: Pick<DesignDirective, 'seed' | 'tone'>): DesignPalette {
  const hue = HUE_DEGREES[directive.seed.hueFamily];
  const chroma = directive.seed.chromaLevel === 'mid' ? 24 : 12;
  const base = tinycolor('#FAFBFC');
  const tint = tinycolor({ h: hue, s: chroma, l: 96 });
  const dark = tinycolor({ h: hue, s: Math.max(chroma, 28), l: 25 });
  const lightSurfaces = [base, tint];
  const primaryCandidate = tinycolor({ h: hue, s: Math.max(chroma + 30, 48), l: 47 });
  const secondaryCandidate = tinycolor({
    h: (hue + 28) % 360,
    s: Math.max(chroma + 22, 42),
    l: 43,
  });
  const achievementCandidate = tinycolor({
    h: (hue + 132) % 360,
    s: Math.max(chroma + 20, 40),
    l: 39,
  });
  const onDark = tinycolor('#E4E8F0');

  return {
    'surface.base': hex(base),
    'surface.tint': hex(tint),
    'surface.dark': hex(dark),
    'surface.card.onBase': '#FFFFFF',
    'surface.card.onTint': '#FFFFFF',
    'surface.card.onDark': hex(tinycolor({ h: hue, s: Math.max(chroma, 28), l: 31 })),
    'text.primary': textColorOnLight(tinycolor('#252A31'), lightSurfaces),
    'text.secondary': textColorOnLight(tinycolor('#4B5563'), lightSurfaces),
    'text.onDark': '#FFFFFF',
    'text.onDark.secondary': textColorOnDark(onDark, dark),
    'accent.primary': textColorOnLight(primaryCandidate, lightSurfaces),
    'accent.secondary': textColorOnLight(secondaryCandidate, lightSurfaces),
    'accent.achievement': textColorOnLight(achievementCandidate, lightSurfaces),
    'accent.onDark': textColorOnDark(primaryCandidate, dark),
    'border.hairline': '#D7DDE5',
    'functional.correct': textColorOnLight(tinycolor('#176B3A'), lightSurfaces),
    'functional.incorrect': textColorOnLight(tinycolor('#A12828'), lightSurfaces),
    'functional.warning': textColorOnLight(tinycolor('#805000'), lightSurfaces),
    'functional.info': textColorOnLight(tinycolor('#155B8A'), lightSurfaces),
  };
}

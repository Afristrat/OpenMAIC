import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import {
  DEFAULT_DESIGN_DIRECTIVE,
  DESIGN_FORBIDDEN_MAX_ENTRIES,
  DESIGN_FORBIDDEN_MAX_LENGTH,
  DESIGN_NOTES_MAX_LENGTH,
  DESIGN_HUE_FAMILIES,
  buildPalette,
  buildSlideTheme,
  buildSurfaceBackground,
  clampAtWord,
  designDirectiveSchema,
  isDesignSystemV1Enabled,
  normalizeDesignDirective,
  resolveSlideSurface,
} from '@/lib/branding/design-directive';

const validPlan = {
  courseTitle: 'Safety briefing',
  languageDirective: 'Teach in English.',
  syllabus: {
    audience: 'Industrial operators',
    prerequisites: 'None',
    overallObjective: 'Apply the procedure safely.',
    learningObjectives: ['Identify hazards'],
    totalDurationMinutes: 15,
    deliveryMode: 'Asynchronous',
    assessmentStrategy: 'Scenario response',
    expectedDeliverable: 'A completed checklist',
  },
  outlines: [
    {
      id: 'scene-1',
      type: 'slide',
      title: 'Hazard review',
      description: 'Identify the principal hazards.',
      keyPoints: ['Stop', 'Assess'],
      order: 1,
    },
  ],
};

describe('course design directive', () => {
  it('keeps the tenant flag off unless settings explicitly enable it', () => {
    expect(isDesignSystemV1Enabled(undefined)).toBe(false);
    expect(isDesignSystemV1Enabled({ features: { design_system_v1: false } })).toBe(false);
    expect(isDesignSystemV1Enabled({ features: { design_system_v1: true } })).toBe(true);
    expect(isDesignSystemV1Enabled({ design_system_v1: true })).toBe(false);
  });

  it('accepts legacy classroom plans that omit the optional directive', () => {
    expect(approvedClassroomPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it('accepts a bounded directive and rejects model-authored hex palettes', () => {
    const parsed = designDirectiveSchema.safeParse(DEFAULT_DESIGN_DIRECTIVE);
    expect(parsed.success).toBe(true);
    expect(
      designDirectiveSchema.safeParse({
        ...DEFAULT_DESIGN_DIRECTIVE,
        palette: { 'surface.base': '#FFFFFF' },
      }).success,
    ).toBe(false);
  });

  it('replaces invalid output with the safe default and reports the issue', () => {
    const result = normalizeDesignDirective({ ...DEFAULT_DESIGN_DIRECTIVE, tone: 'neon' });
    expect(result.directive).toEqual(DEFAULT_DESIGN_DIRECTIVE);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('keeps the designed directive when only the advisory free text is too long', () => {
    const designed = {
      ...DEFAULT_DESIGN_DIRECTIVE,
      tone: 'warm',
      seed: { hueFamily: 'blue', chromaLevel: 'mid' },
      notes: 'n'.repeat(DESIGN_NOTES_MAX_LENGTH * 2),
      forbidden: ['a'.repeat(300), 'b', ' ', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    };
    const result = normalizeDesignDirective(designed);
    expect(result.warnings).toEqual([]);
    expect(result.directive.tone).toBe('warm');
    expect(result.directive.seed).toEqual({ hueFamily: 'blue', chromaLevel: 'mid' });
    expect(result.directive.notes).toHaveLength(DESIGN_NOTES_MAX_LENGTH);
    expect(result.directive.forbidden).toEqual([
      'a'.repeat(DESIGN_FORBIDDEN_MAX_LENGTH),
      ...['b', 'c', 'd', 'e', 'f', 'g', 'h'],
    ]);
    expect(result.directive.forbidden).toHaveLength(DESIGN_FORBIDDEN_MAX_ENTRIES);
  });

  it('cuts advisory text at a word boundary, never mid-word', () => {
    const notes =
      'Design sobre et structuré pour un public technique sceptique, avec hiérarchie visuelle claire et espaces aérés';
    const cut = clampAtWord(notes, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith('…')).toBe(true);
    expect(notes.startsWith(cut.slice(0, -1))).toBe(true);
    expect(notes.charAt(cut.length - 1)).toMatch(/\s/);
    expect(clampAtWord('court', 100)).toBe('court');
  });

  it('keeps the maximum valid serialized directive within the 1,000-character contract', () => {
    const result = normalizeDesignDirective({
      ...DEFAULT_DESIGN_DIRECTIVE,
      forbidden: Array.from({ length: DESIGN_FORBIDDEN_MAX_ENTRIES }, () =>
        'x'.repeat(DESIGN_FORBIDDEN_MAX_LENGTH),
      ),
      notes: 'n'.repeat(DESIGN_NOTES_MAX_LENGTH),
    });
    expect(JSON.stringify(result.directive).length).toBeLessThanOrEqual(3_500);
    expect(result.directive.forbidden.length).toBeLessThanOrEqual(DESIGN_FORBIDDEN_MAX_ENTRIES);
    expect(result.directive.notes.length).toBeLessThanOrEqual(DESIGN_NOTES_MAX_LENGTH);
    expect(result.warnings).toEqual([]);
  });

  it('derives a deterministic palette whose text roles meet 4.5:1 contrast', () => {
    const palette = buildPalette(DEFAULT_DESIGN_DIRECTIVE);
    expect(buildPalette(DEFAULT_DESIGN_DIRECTIVE)).toEqual(palette);

    for (const background of [palette['surface.base'], palette['surface.tint']]) {
      for (const foreground of [
        palette['text.primary'],
        palette['text.secondary'],
        palette['accent.primary'],
        palette['accent.secondary'],
        palette['accent.achievement'],
        palette['functional.correct'],
        palette['functional.incorrect'],
        palette['functional.warning'],
        palette['functional.info'],
      ]) {
        expect(tinycolor.readability(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(
      tinycolor.readability(palette['text.onDark'], palette['surface.dark']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      tinycolor.readability(palette['accent.onDark'], palette['surface.dark']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every derived hue family accessible on both light surfaces', () => {
    for (const hueFamily of DESIGN_HUE_FAMILIES) {
      for (const chromaLevel of ['low', 'mid'] as const) {
        const palette = buildPalette({
          seed: { hueFamily, chromaLevel },
          tone: 'sober',
        });
        for (const background of [palette['surface.base'], palette['surface.tint']]) {
          for (const foreground of [
            palette['text.primary'],
            palette['text.secondary'],
            palette['accent.primary'],
            palette['accent.secondary'],
            palette['accent.achievement'],
            palette['functional.correct'],
            palette['functional.incorrect'],
            palette['functional.warning'],
            palette['functional.info'],
          ]) {
            expect(tinycolor.readability(foreground, background)).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(
          tinycolor.readability(palette['text.onDark'], palette['surface.dark']),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          tinycolor.readability(palette['accent.onDark'], palette['surface.dark']),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses a neutral Inter theme by default and a directive-selected font when present', () => {
    const defaultTheme = buildSlideTheme();
    expect(defaultTheme.backgroundColor).toBe('#FAFBFC');
    expect(defaultTheme.fontName).toBe('Inter');
    expect(defaultTheme.themeColors).toEqual([
      buildPalette(DEFAULT_DESIGN_DIRECTIVE)['accent.primary'],
      buildPalette(DEFAULT_DESIGN_DIRECTIVE)['accent.secondary'],
      buildPalette(DEFAULT_DESIGN_DIRECTIVE)['accent.achievement'],
      buildPalette(DEFAULT_DESIGN_DIRECTIVE)['functional.correct'],
      buildPalette(DEFAULT_DESIGN_DIRECTIVE)['functional.incorrect'],
    ]);

    expect(
      buildSlideTheme({
        ...DEFAULT_DESIGN_DIRECTIVE,
        typography: { ...DEFAULT_DESIGN_DIRECTIVE.typography, heading: 'Merriweather' },
      }).fontName,
    ).toBe('Merriweather');
  });

  it('resolves safe tenant palette and font tokens ahead of course defaults', () => {
    const brandSnapshot = {
      version: 1 as const,
      createdAt: '2026-10-09T00:00:00.000Z',
      content:
        'colors: background=#F7F8FA surface=#FFFFFF ink=#202A35 accent=#7A2E8E secondary=#145A67\nfonts: display=Merriweather; body=Inter; utility=Inter',
    };

    const theme = buildSlideTheme(DEFAULT_DESIGN_DIRECTIVE, brandSnapshot);
    expect(theme.backgroundColor).toBe('#F7F8FA');
    expect(theme.fontColor).toBe('#202A35');
    expect(theme.themeColors.slice(0, 2)).toEqual(['#7A2E8E', '#145A67']);
    expect(theme.fontName).toBe('Merriweather');
  });

  it('ignores malformed brand color and unauthorized font values', () => {
    const brandSnapshot = {
      version: 1 as const,
      createdAt: '2026-10-09T00:00:00.000Z',
      content: 'colors: background=red ink=#FFF\nfonts: display=Comic Sans',
    };

    const theme = buildSlideTheme(DEFAULT_DESIGN_DIRECTIVE, brandSnapshot);
    expect(theme.backgroundColor).toBe(buildPalette(DEFAULT_DESIGN_DIRECTIVE)['surface.base']);
    expect(theme.fontColor).toBe(buildPalette(DEFAULT_DESIGN_DIRECTIVE)['text.primary']);
    expect(theme.fontName).toBe('Inter');
  });
});

describe('resolveSlideSurface', () => {
  const directive = normalizeDesignDirective({
    ...DEFAULT_DESIGN_DIRECTIVE,
    seed: { hueFamily: 'teal', chromaLevel: 'low' },
    surfacePlan: { content: 'base', engagement: 'dark', punchline: 'none' },
  }).directive;

  it('gives each slide function its surface from the course plan', () => {
    expect(resolveSlideSurface('cover', directive).role).toBe('tint');
    expect(resolveSlideSurface('contents', directive).role).toBe('base');
    expect(resolveSlideSurface('content', directive).role).toBe('base');
    expect(resolveSlideSurface('transition', directive).role).toBe('dark');
    expect(resolveSlideSurface('end', directive).role).toBe('dark');
  });

  it('keeps the tenant background for the base role and derives tint and dark', () => {
    const brand = {
      version: 1 as const,
      createdAt: '2026-10-12T00:00:00.000Z',
      content: 'colors: background=#FFFFFF surface=#F0F0F0 ink=#111827 accent=#0A72A1',
    };
    expect(resolveSlideSurface('content', directive, brand).color).toBe('#FFFFFF');
    expect(resolveSlideSurface('cover', directive, brand).color).not.toBe('#FFFFFF');
    expect(resolveSlideSurface('end', directive, brand).color).not.toBe('#FFFFFF');
  });

  it('imposes a solid background on every surface, gradients being reserved to one punchline', () => {
    for (const slideFunction of ['cover', 'contents', 'content', 'end'] as const) {
      const surface = resolveSlideSurface(slideFunction, directive);
      expect(buildSurfaceBackground(surface)).toEqual({ type: 'solid', color: surface.color });
    }
  });
});

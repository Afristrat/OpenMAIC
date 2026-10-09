import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import {
  DEFAULT_DESIGN_DIRECTIVE,
  DESIGN_HUE_FAMILIES,
  buildPalette,
  buildSlideTheme,
  designDirectiveSchema,
  isDesignSystemV1Enabled,
  normalizeDesignDirective,
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
    expect(designDirectiveSchema.safeParse({
      ...DEFAULT_DESIGN_DIRECTIVE,
      palette: { 'surface.base': '#FFFFFF' },
    }).success).toBe(false);
  });

  it('replaces invalid output with the safe default and reports the issue', () => {
    const result = normalizeDesignDirective({ ...DEFAULT_DESIGN_DIRECTIVE, tone: 'neon' });
    expect(result.directive).toEqual(DEFAULT_DESIGN_DIRECTIVE);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('keeps the maximum valid serialized directive within the 1,000-character contract', () => {
    const result = normalizeDesignDirective({
      ...DEFAULT_DESIGN_DIRECTIVE,
      forbidden: ['x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60)],
      notes: 'n'.repeat(100),
    });
    expect(JSON.stringify(result.directive).length).toBeLessThanOrEqual(1_000);
    expect(result.directive.forbidden.length).toBeLessThanOrEqual(3);
    expect(result.directive.notes.length).toBeLessThanOrEqual(100);
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

    expect(tinycolor.readability(palette['text.onDark'], palette['surface.dark']))
      .toBeGreaterThanOrEqual(4.5);
    expect(tinycolor.readability(palette['accent.onDark'], palette['surface.dark']))
      .toBeGreaterThanOrEqual(4.5);
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
        expect(tinycolor.readability(palette['text.onDark'], palette['surface.dark']))
          .toBeGreaterThanOrEqual(4.5);
        expect(tinycolor.readability(palette['accent.onDark'], palette['surface.dark']))
          .toBeGreaterThanOrEqual(4.5);
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

    expect(buildSlideTheme({
      ...DEFAULT_DESIGN_DIRECTIVE,
      typography: { ...DEFAULT_DESIGN_DIRECTIVE.typography, heading: 'Merriweather' },
    }).fontName).toBe('Merriweather');
  });
});

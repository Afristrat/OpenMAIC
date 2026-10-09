import { describe, expect, test } from 'vitest';
import type { Slide, Stage } from '@openmaic/dsl';
import { DEFAULT_DESIGN_DIRECTIVE, buildPalette } from '@/lib/branding/design-directive';
import {
  getCiede2000,
  getWcagContrast,
  lintAndRepairAdaptiveSlide,
} from '@/lib/edit/adaptive-slide-linter';

const palette = buildPalette(DEFAULT_DESIGN_DIRECTIVE);
const slide: Slide = {
  id: 'adaptive-slide',
  type: 'content',
  viewportSize: 1000,
  viewportRatio: 0.5625,
  theme: {
    backgroundColor: palette['surface.base'],
    themeColors: [],
    fontColor: palette['text.primary'],
    fontName: 'Inter',
  },
  background: { type: 'solid', color: palette['surface.base'] },
  elements: [
    {
      id: 'title',
      type: 'text',
      name: 'title',
      textType: 'title',
      left: 80,
      top: 72,
      width: 840,
      height: 48,
      rotate: 0,
      content: '<p style="font-size:28px">A concise title</p>',
      defaultFontName: 'Inter',
      defaultColor: palette['text.primary'],
    },
    {
      id: 'body',
      type: 'text',
      name: 'body',
      textType: 'content',
      left: 80,
      top: 150,
      width: 840,
      height: 90,
      rotate: 0,
      content:
        '<p style="font-size:18px">A short explanation with enough space for comfortable reading.</p>',
      defaultFontName: 'Inter',
      defaultColor: palette['text.primary'],
    },
  ],
};

const options = { directive: DEFAULT_DESIGN_DIRECTIVE };

function textElementAt(target: Slide, index: number) {
  const element = target.elements[index];
  if (element?.type !== 'text') throw new Error(`Expected text element at index ${index}`);
  return element;
}

describe('adaptive slide linter', () => {
  test('computes WCAG contrast and CIEDE2000 deterministically', () => {
    expect(getWcagContrast('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(getCiede2000('#1A8FC2', '#1A8FC2')).toBe(0);
    expect(getCiede2000('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });

  test('does not flag a compliant slide', () => {
    expect(lintAndRepairAdaptiveSlide(slide, options).issues).toEqual([]);
  });

  test('repairs the reference blue label to an accessible shade', () => {
    const brandSnapshot: Stage['brandSnapshot'] = {
      version: 1,
      createdAt: '2026-10-09T00:00:00.000Z',
      content: 'colors: background=#F6F9F7; accent=#1A8FC2',
    };
    const lowContrast = structuredClone(slide);
    lowContrast.background = { type: 'solid', color: '#F6F9F7' };
    lowContrast.elements[1] = {
      ...textElementAt(lowContrast, 1),
      content: '<p style="font-size:12px;color:#1A8FC2">Label</p>',
      defaultColor: '#1A8FC2',
      name: 'label',
    };
    const result = lintAndRepairAdaptiveSlide(lowContrast, { ...options, brandSnapshot });
    const repaired = result.slide.elements[1];
    expect(result.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-CONTRAST-TEXT', repaired: true }),
    );
    expect(repaired?.type).toBe('text');
    if (repaired?.type === 'text') {
      expect(getWcagContrast(repaired.defaultColor, '#F6F9F7')).toBeGreaterThanOrEqual(4.5);
      expect(repaired.content).not.toContain('#1A8FC2');
    }
  });

  test('maps a near-palette value and rejects a distant value', () => {
    const near = structuredClone(slide);
    near.elements[1] = {
      ...textElementAt(near, 1),
      defaultColor: '#262A31',
      content: '<p style="font-size:18px;color:#262A31">Near palette</p>',
    };
    const nearResult = lintAndRepairAdaptiveSlide(near, options);
    const repaired = nearResult.slide.elements[1];
    expect(nearResult.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-PALETTE', repaired: true }),
    );
    expect(repaired?.type).toBe('text');
    if (repaired?.type === 'text') expect(repaired.content).not.toContain('#262A31');

    const distant = structuredClone(slide);
    distant.elements[1] = { ...textElementAt(distant, 1), defaultColor: '#FF0000' };
    expect(lintAndRepairAdaptiveSlide(distant, options).issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-PALETTE', severity: 'error' }),
    );
  });

  test('reports a gradient whose stops and midpoint cannot all meet text contrast', () => {
    const gradientSlide = structuredClone(slide);
    gradientSlide.background = {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 0,
        colors: [
          { pos: 0, color: '#000000' },
          { pos: 100, color: '#FFFFFF' },
        ],
      },
    };
    gradientSlide.elements[1] = {
      ...textElementAt(gradientSlide, 1),
      defaultColor: '#808080',
    };
    const brandSnapshot: Stage['brandSnapshot'] = {
      version: 1,
      createdAt: '2026-10-09T00:00:00.000Z',
      content: 'colors: background=#000000; surface=#FFFFFF; accent=#808080',
    };
    expect(
      lintAndRepairAdaptiveSlide(gradientSlide, { ...options, brandSnapshot }).issues,
    ).toContainEqual(
      expect.objectContaining({ ruleId: 'R-BG-GRADIENT', severity: 'error', elementId: 'body' }),
    );
  });

  test('flags text over an image without an opaque backing shape', () => {
    const imageSlide = structuredClone(slide);
    imageSlide.background = { type: 'image', image: { src: 'image-id', size: 'cover' } };
    expect(lintAndRepairAdaptiveSlide(imageSlide, options).issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-BG-IMAGE', severity: 'error', elementId: 'title' }),
    );
  });

  test('flags undersized text, unsafe geometry, and unsupported fonts', () => {
    const invalid = structuredClone(slide);
    invalid.elements[1] = {
      ...textElementAt(invalid, 1),
      left: 20,
      defaultFontName: 'Comic Sans',
      content: '<p style="font-size:10px">Text trop petit</p>',
    };
    const issues = lintAndRepairAdaptiveSlide(invalid, options).issues;
    expect(issues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining(['R-MINSIZE', 'R-SAFE-AREA', 'R-FONT']),
    );
  });

  test('enlarges a text box when the safe area has room and no overlap is introduced', () => {
    const cramped = structuredClone(slide);
    cramped.elements[1] = {
      ...textElementAt(cramped, 1),
      width: 120,
      height: 20,
      content:
        '<p style="font-size:18px">A long line of content needs a larger box to remain readable.</p>',
    };
    const result = lintAndRepairAdaptiveSlide(cramped, options);
    const body = textElementAt(result.slide, 1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-CAPACITY', repaired: true, severity: 'warning' }),
    );
    expect(body.height).toBeGreaterThan(20);
    expect(
      result.issues.some((issue) => issue.ruleId === 'R-CAPACITY' && issue.severity === 'error'),
    ).toBe(false);
  });

  test('preserves the legacy layout audit for overlaps and rejects shape gradients', () => {
    const invalid = structuredClone(slide);
    invalid.elements.push({
      id: 'gradient-shape',
      type: 'shape',
      left: 80,
      top: 300,
      width: 200,
      height: 80,
      rotate: 0,
      viewBox: [1, 1],
      path: 'M 0 0 L 1 0 L 1 1 Z',
      fixedRatio: false,
      fill: '#FFFFFF',
      gradient: {
        type: 'linear',
        rotate: 0,
        colors: [
          { pos: 0, color: '#FFFFFF' },
          { pos: 100, color: '#000000' },
        ],
      },
    });
    invalid.elements[2]!.name = 'decor';
    const issues = lintAndRepairAdaptiveSlide(invalid, options).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-GRADIENT-ONLY-BG', severity: 'error' }),
    );
    expect(issues.some((issue) => issue.ruleId === 'R-OVERLAP')).toBe(false);
  });
});

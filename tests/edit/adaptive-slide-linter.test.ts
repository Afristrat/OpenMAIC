import { describe, expect, test } from 'vitest';
import tinycolor from 'tinycolor2';
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
    const nearColor = tinycolor(palette['text.primary']).lighten(1).toHexString().toUpperCase();
    near.elements[1] = {
      ...textElementAt(near, 1),
      defaultColor: nearColor,
      content: `<p style="font-size:18px;color:${nearColor}">Near palette</p>`,
    };
    const nearResult = lintAndRepairAdaptiveSlide(near, options);
    const repaired = nearResult.slide.elements[1];
    expect(nearResult.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-PALETTE', repaired: true }),
    );
    expect(repaired?.type).toBe('text');
    if (repaired?.type === 'text') expect(repaired.content).not.toContain(nearColor);

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

  test('repairs undersized text and out-of-margin geometry instead of rejecting the slide', () => {
    const drifting = structuredClone(slide);
    drifting.elements[1] = {
      ...textElementAt(drifting, 1),
      left: 20,
      width: 700,
      content: '<p style="font-size:14px">Texte légèrement trop petit</p>',
    };
    const result = lintAndRepairAdaptiveSlide(drifting, options);
    const body = textElementAt(result.slide, 1);
    const margin = DEFAULT_DESIGN_DIRECTIVE.grid.margin;
    expect(body.left).toBe(margin);
    expect(body.content).toContain('font-size:16px');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-MINSIZE', severity: 'warning', repaired: true }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-SAFE-AREA', severity: 'warning', repaired: true }),
    );
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  test('shrinks a box wider than the safe area and keeps a fixed-ratio image proportional', () => {
    const oversized = structuredClone(slide);
    oversized.elements.push({
      id: 'picture',
      type: 'image',
      name: 'media',
      left: 0,
      top: 300,
      width: 1000,
      height: 200,
      rotate: 0,
      fixedRatio: true,
      src: 'https://example.test/picture.png',
    } as Slide['elements'][number]);
    const result = lintAndRepairAdaptiveSlide(oversized, options);
    const picture = result.slide.elements.find((element) => element.id === 'picture');
    const margin = DEFAULT_DESIGN_DIRECTIVE.grid.margin;
    if (!picture || picture.type !== 'image') throw new Error('Expected the image to survive');
    expect(picture.left).toBeGreaterThanOrEqual(margin);
    expect(picture.left + picture.width).toBeLessThanOrEqual(1000 - margin);
    expect(picture.width / picture.height).toBeCloseTo(5, 5);
  });

  test('leaves a safe-area violation reported when moving the box would create an overlap', () => {
    const crowded = structuredClone(slide);
    crowded.elements[1] = {
      ...textElementAt(crowded, 1),
      left: 20,
      top: 150,
      width: 400,
      height: 90,
    };
    crowded.elements.push({
      ...textElementAt(crowded, 1),
      id: 'neighbour',
      left: 72,
      top: 150,
      width: 400,
      height: 90,
    });
    const result = lintAndRepairAdaptiveSlide(crowded, options);
    expect(textElementAt(result.slide, 1).left).toBe(20);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-SAFE-AREA', severity: 'error', elementId: 'body' }),
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
  test('measures the contrast of a text against the card or banner it sits on', () => {
    const banner = structuredClone(slide);
    banner.elements = [
      {
        id: 'banner',
        type: 'shape',
        name: 'card-bg',
        left: 80,
        top: 300,
        width: 840,
        height: 120,
        rotate: 0,
        viewBox: [200, 200],
        path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
        fill: palette['surface.dark'],
        fixedRatio: false,
      },
      {
        ...textElementAt(slide, 1),
        id: 'on-banner',
        top: 320,
        height: 60,
        defaultColor: '#666666',
        content: '<p style="font-size:18px;color:#666666">Grey text on a dark banner</p>',
      },
    ];
    const result = lintAndRepairAdaptiveSlide(banner, options);
    const repaired = result.slide.elements.find((element) => element.id === 'on-banner');
    expect(repaired?.type === 'text' ? repaired.defaultColor : '').not.toBe('#666666');
    if (repaired?.type === 'text') {
      expect(
        getWcagContrast(repaired.defaultColor, palette['surface.dark']),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('requires the same contrast for large text as for body text', () => {
    const large = structuredClone(slide);
    large.elements[0] = {
      ...textElementAt(large, 0),
      defaultColor: '#8A9A98',
      content: '<p style="font-size:36px;color:#8A9A98">Pale large title</p>',
    };
    expect(getWcagContrast('#8A9A98', palette['surface.base'])).toBeLessThan(4.5);
    expect(lintAndRepairAdaptiveSlide(large, options).issues).toContainEqual(
      expect.objectContaining({ ruleId: 'R-CONTRAST-TEXT' }),
    );
  });
});

import { describe, expect, test } from 'vitest';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import type { Slide } from '@openmaic/dsl';

const slide: Slide = {
  id: 'slide',
  viewportSize: 1000,
  viewportRatio: 0.5,
  theme: { backgroundColor: '#fff', themeColors: [], fontColor: '#111', fontName: 'Inter' },
  elements: [
    {
      id: 'a',
      type: 'text',
      left: -10,
      top: 10,
      width: 120,
      height: 50,
      rotate: 0,
      content: '<p>A</p>',
      defaultFontName: 'Inter',
      defaultColor: '#111',
    },
    {
      id: 'b',
      type: 'text',
      left: 80,
      top: 20,
      width: 120,
      height: 50,
      rotate: 0,
      content: '<p>B</p>',
      defaultFontName: 'Inter',
      defaultColor: '#111',
    },
  ],
};

describe('auditSlideLayout', () => {
  test('reports an out-of-bounds element and a real overlap', () => {
    expect(auditSlideLayout(slide)).toEqual([
      { type: 'out-of-bounds', elementId: 'a' },
      { type: 'overlap', elementIds: ['a', 'b'] },
    ]);
  });

  test('ignores a tiny decorative contact but flags a concealing overlap', () => {
    const tinyContact = structuredClone(slide);
    tinyContact.elements[1].left = 119;
    expect(auditSlideLayout(tinyContact).filter((issue) => issue.type === 'overlap')).toEqual([]);
    expect(auditSlideLayout(slide).filter((issue) => issue.type === 'overlap')).toHaveLength(1);
  });

  test('ignores an intentional text overlay on a decorative shape', () => {
    const panel = structuredClone(slide);
    panel.elements[0] = {
      id: 'panel',
      type: 'shape',
      left: 20,
      top: 20,
      width: 300,
      height: 120,
      rotate: 0,
      path: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
      viewBox: [1, 1],
      fill: '#ffffff',
      fixedRatio: false,
    };
    panel.elements[1].left = 40;
    panel.elements[1].top = 40;

    expect(auditSlideLayout(panel).filter((issue) => issue.type === 'overlap')).toEqual([]);
  });

  test('uses the rendered minimum height of every table row', () => {
    const tableOverflow: Slide = {
      ...structuredClone(slide),
      elements: [
        {
          id: 'table',
          type: 'table',
          left: 40,
          top: 40,
          width: 500,
          height: 90,
          rotate: 0,
          outline: { width: 1, color: '#111', style: 'solid' },
          colWidths: [1],
          cellMinHeight: 36,
          data: Array.from({ length: 4 }, (_, index) => [
            { id: `cell-${index}`, colspan: 1, rowspan: 1, text: `Ligne ${index + 1}` },
          ]),
        },
        {
          id: 'paragraph',
          type: 'text',
          left: 40,
          top: 150,
          width: 500,
          height: 50,
          rotate: 0,
          content: '<p>Conclusion</p>',
          defaultFontName: 'Inter',
          defaultColor: '#111',
        },
      ],
    };

    expect(auditSlideLayout(tableOverflow)).toContainEqual({
      type: 'overlap',
      elementIds: ['table', 'paragraph'],
    });
  });
});

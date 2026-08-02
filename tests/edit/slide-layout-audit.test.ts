import { describe, expect, test } from 'vitest';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import type { Slide } from '@openmaic/dsl';

const slide: Slide = {
  id: 'slide', viewportSize: 1000, viewportRatio: 0.5,
  theme: { backgroundColor: '#fff', themeColors: [], fontColor: '#111', fontName: 'Inter' },
  elements: [
    { id: 'a', type: 'text', left: -10, top: 10, width: 120, height: 50, rotate: 0, content: '<p>A</p>', defaultFontName: 'Inter', defaultColor: '#111' },
    { id: 'b', type: 'text', left: 80, top: 20, width: 120, height: 50, rotate: 0, content: '<p>B</p>', defaultFontName: 'Inter', defaultColor: '#111' },
  ],
};

describe('auditSlideLayout', () => {
  test('reports an out-of-bounds element and a real overlap', () => {
    expect(auditSlideLayout(slide)).toEqual([
      { type: 'out-of-bounds', elementId: 'a' },
      { type: 'overlap', elementIds: ['a', 'b'] },
    ]);
  });
});

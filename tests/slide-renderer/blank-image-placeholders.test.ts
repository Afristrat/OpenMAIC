import { describe, expect, it } from 'vitest';
import type { Slide } from '@openmaic/dsl';
import { blankImagePlaceholders } from '@/components/slide-renderer/SlideThumbnail';

function slideWith(...srcs: string[]): Slide {
  return {
    id: 's1',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    elements: srcs.map((src, i) => ({ id: `e${i}`, type: 'image', src })),
  } as unknown as Slide;
}

describe('blankImagePlaceholders', () => {
  it('blanks gen_img placeholders so no relative URL is requested', () => {
    const result = blankImagePlaceholders(slideWith('gen_img_FCIZUN__', 'https://cdn.test/a.png'));
    expect(result.elements.map((el) => (el.type === 'image' ? el.src : null))).toEqual([
      '',
      'https://cdn.test/a.png',
    ]);
  });

  it('returns the same slide when nothing is a placeholder', () => {
    const slide = slideWith('https://cdn.test/a.png');
    expect(blankImagePlaceholders(slide)).toBe(slide);
  });
});

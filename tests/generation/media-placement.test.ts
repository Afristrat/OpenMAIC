import { describe, expect, it } from 'vitest';

import { placeGeneratedMediaOnSlides } from '@/lib/generation/media-placement';
import type { SceneOutline } from '@/lib/types/generation';
import type { MediaGenerationRequest } from '@/lib/media/types';

const image: MediaGenerationRequest = {
  type: 'image',
  prompt: 'Une prévision glissante de trésorerie sur treize semaines',
  elementId: 'gen_img_budget',
  aspectRatio: '16:9',
};

function outline(order: number, type: SceneOutline['type'] = 'slide'): SceneOutline {
  return {
    id: `scene-${order}`,
    type,
    title: `Séquence ${order}`,
    description: `Description ${order}`,
    keyPoints: [`Point ${order}`],
    order,
  };
}

describe('generated media placement', () => {
  it('moves media from a resource slide to the nearest ordinary slide', () => {
    const source = [
      outline(1),
      {
        ...outline(2),
        resourceGenerations: [
          {
            id: 'budget',
            format: 'xlsx' as const,
            title: 'Budget de trésorerie',
            fileName: 'prevision-tresorerie-13-semaines.xlsx',
            prompt: 'Créer un classeur de trésorerie à compléter',
          },
        ],
        mediaGenerations: [image],
      },
      outline(3),
    ];

    const result = placeGeneratedMediaOnSlides(source);

    expect(result[1].mediaGenerations).toBeUndefined();
    expect(result[0].mediaGenerations).toEqual([image]);
    expect(source[1].mediaGenerations).toEqual([image]);
  });

  it('moves media from a non-slide scene and preserves existing target media', () => {
    const existing = { ...image, elementId: 'gen_img_existing' };
    const result = placeGeneratedMediaOnSlides([
      { ...outline(1), mediaGenerations: [existing] },
      { ...outline(2, 'interactive'), mediaGenerations: [image] },
    ]);

    expect(result[0].mediaGenerations).toEqual([existing, image]);
    expect(result[1].mediaGenerations).toBeUndefined();
  });

  it('removes impossible requests when no slide canvas exists', () => {
    const source = [{ ...outline(1, 'quiz'), mediaGenerations: [image] }];
    expect(placeGeneratedMediaOnSlides(source)[0].mediaGenerations).toBeUndefined();
    expect(source[0].mediaGenerations).toEqual([image]);
  });
});

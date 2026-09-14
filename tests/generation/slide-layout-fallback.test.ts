import { describe, expect, it } from 'vitest';
import type { Slide } from '@openmaic/dsl';

import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'cash-flow-calculation',
  type: 'slide',
  title: 'Calcul guidé de la trésorerie hebdomadaire',
  description: 'Appliquez le calcul à une situation professionnelle réelle.',
  keyPoints: ['Recettes prévues', 'Décaissements prévus', 'Solde de fin de semaine'],
  order: 2,
};

describe('slide layout fallback', () => {
  it('keeps an ordinary slide when the provider returns invalid geometry', async () => {
    const content = await generateSceneContent(outline, async () =>
      JSON.stringify({
        elements: [
          {
            id: 'outside-canvas',
            type: 'text',
            left: 1500,
            top: 800,
            width: 640,
            height: 200,
            content: '<p>Contenu pédagogique valide</p>',
            defaultFontName: '',
            defaultColor: '#333333',
          },
        ],
      }),
    );

    expect(content).not.toBeNull();
    if (!content || !('elements' in content)) return;

    expect(JSON.stringify(content.elements)).toContain(outline.title);
    expect(
      auditSlideLayout({
        id: outline.id,
        elements: content.elements,
        viewportSize: 1000,
        viewportRatio: 0.5625,
      } as Slide),
    ).toEqual([]);
  });
});

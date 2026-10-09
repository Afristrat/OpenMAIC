import { describe, expect, it } from 'vitest';
import type { Slide } from '@openmaic/dsl';

import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { generateSceneContent } from '@/lib/generation/scene-generator';
import { DEFAULT_DESIGN_DIRECTIVE } from '@/lib/branding/design-directive';
import type { SceneOutline } from '@/lib/types/generation';
import type { AICallFn, DesignEventRecorder } from '@/lib/generation/pipeline-types';
import { setAICallDesignEventRecorder } from '@/lib/generation/pipeline-types';

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

  it('keeps tenant typography, palette and safe margins in the deterministic fallback', async () => {
    const recordedEvents: Parameters<DesignEventRecorder>[0][] = [];
    const recordDesignEvent: DesignEventRecorder = async (event) => {
      recordedEvents.push(event);
    };
    const aiCall: AICallFn = async () =>
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
      });
    setAICallDesignEventRecorder(aiCall, recordDesignEvent);
    const content = await generateSceneContent(outline, aiCall, {
      designDirective: DEFAULT_DESIGN_DIRECTIVE,
      brandSnapshot: {
        version: 1,
        createdAt: '2026-10-09T00:00:00.000Z',
        content:
          'colors: background=#F7F8FA ink=#202A35 accent=#7A2E8E\nfonts: display=Merriweather; body=Inter; utility=Inter',
      },
    });

    expect(content).not.toBeNull();
    if (!content || !('elements' in content)) return;
    expect(content.background).toEqual({ type: 'solid', color: '#F7F8FA' });
    const title = content.elements.find((element) => element.name === 'title');
    expect(title).toMatchObject({
      left: 72,
      width: 856,
      defaultFontName: 'Merriweather',
      defaultColor: '#202A35',
      textType: 'title',
    });
    expect(recordedEvents).toContainEqual({
      sceneId: outline.id,
      eventType: 'layout_fallback',
    });
  });
});

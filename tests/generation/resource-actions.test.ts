import { describe, expect, it, vi } from 'vitest';
import { generateSceneActions } from '@/lib/generation/scene-generator';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';

describe('downloadable resource narration', () => {
  it('announces the real file and pauses before a final discussion', async () => {
    const outline: SceneOutline = {
      id: 'scene_8',
      type: 'slide',
      title: 'Budget',
      description: 'Apply the budget method.',
      keyPoints: ['Assumptions', 'Cash flow'],
      order: 8,
      generatedResources: [
        {
          id: 'resource_1',
          format: 'xlsx',
          title: 'Budget prévisionnel',
          fileName: 'budget-previsionnel.xlsx',
          downloadUrl: 'https://qalem.ma/A7bK2',
          qrImageUrl: '/api/classroom-media/classroom/resources/resource_1-qr.png',
        },
      ],
    };
    const content: GeneratedSlideContent = {
      elements: [
        {
          id: 'text_1',
          type: 'text',
          left: 50,
          top: 50,
          width: 900,
          height: 76,
          content: '<p>Budget</p>',
          defaultFontName: '',
          defaultColor: '#000000',
          rotate: 0,
        },
      ],
    };
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify([
        { type: 'text', content: 'Appliquons maintenant la méthode.' },
        { type: 'action', name: 'discussion', params: { topic: 'Quel risque voyez-vous ?' } },
      ]),
    );

    const actions = await generateSceneActions(outline, content, aiCall, {
      languageDirective: 'Deliver the entire course in French.',
    });
    const pauseIndex = actions.findIndex((action) => action.type === 'resource_pause');
    const discussionIndex = actions.findIndex((action) => action.type === 'discussion');
    expect(pauseIndex).toBeGreaterThan(0);
    expect(pauseIndex).toBeLessThan(discussionIndex);
    expect(actions[pauseIndex - 1]).toMatchObject({
      type: 'speech',
      text: expect.stringContaining('cliquez sur Lecture'),
    });
    expect(actions[pauseIndex]).toMatchObject({
      resourceId: 'resource_1',
      downloadUrl: 'https://qalem.ma/A7bK2',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';
import { generateSceneActions } from '@/lib/generation/scene-generator';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';

describe('downloadable resource narration', () => {
  it('announces the real file and pauses before a final discussion', async () => {
    expectConsoleMessages({
      warn: [
        '[WARN] [Generation] Discussion agentId "(none)" invalid, assigned: curious-mehdi (Mehdi)',
        '[WARN] [Generation] Discussion agentId "(none)" invalid, assigned: curious-mehdi (Mehdi)',
      ],
    });
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
      agents: [
        { id: 'teacher-hanae', name: 'Hanae', role: 'teacher' },
        { id: 'curious-mehdi', name: 'Mehdi', role: 'student' },
      ],
    });
    const pauseIndex = actions.findIndex((action) => action.type === 'resource_pause');
    const discussionIndex = actions.findIndex((action) => action.type === 'discussion');
    expect(pauseIndex).toBeGreaterThan(0);
    expect(pauseIndex).toBeLessThan(discussionIndex);
    expect(actions[pauseIndex - 1]).toMatchObject({
      type: 'speech',
      agentId: 'teacher-hanae',
      text: expect.stringContaining('cliquez sur Lecture'),
    });
    expect(actions[pauseIndex]).toMatchObject({
      resourceId: 'resource_1',
      downloadUrl: 'https://qalem.ma/A7bK2',
    });
  });

  it('removes invented workbook details and keeps only the trusted download checkpoint', async () => {
    const outline: SceneOutline = {
      id: 'scene_resource_truth',
      type: 'slide',
      title: 'Plan d’action',
      description: 'Appliquer la méthode.',
      keyPoints: ['Prioriser les actions'],
      order: 4,
      generatedResources: [
        {
          id: 'resource_truth',
          format: 'xlsx',
          title: 'Plan d’action',
          fileName: 'plan-action.xlsx',
          downloadUrl: 'https://qalem.ma/A7bK2',
          qrImageUrl: '/api/classroom-media/classroom/resources/resource_truth-qr.png',
        },
      ],
    };
    const content: GeneratedSlideContent = {
      elements: [
        {
          id: 'title',
          type: 'text',
          left: 60,
          top: 60,
          width: 880,
          height: 70,
          content: '<p>Plan d’action</p>',
          defaultFontName: '',
          defaultColor: '#000000',
          rotate: 0,
        },
      ],
    };
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify([
        {
          type: 'text',
          content: 'Le classeur contient une matrice d’Ishikawa et un formatage conditionnel.',
        },
        { type: 'text', content: 'Priorisez maintenant les actions selon leur impact.' },
      ]),
    );

    const actions = await generateSceneActions(outline, content, aiCall, {
      languageDirective: 'Deliver the entire course in French.',
    });

    expect(
      actions.some(
        (action) =>
          action.type === 'speech' && /Ishikawa|formatage conditionnel/i.test(action.text),
      ),
    ).toBe(false);
    expect(
      actions.some(
        (action) =>
          action.type === 'speech' && /Priorisez maintenant les actions/i.test(action.text),
      ),
    ).toBe(true);
    expect(actions.some((action) => action.type === 'resource_pause')).toBe(true);
  });

  it('rejette une annonce de téléchargement sans ressource réellement générée', async () => {
    const outline: SceneOutline = {
      id: 'scene_2',
      type: 'slide',
      title: 'Exercice',
      description: 'Appliquer la méthode.',
      keyPoints: ['Application'],
      order: 2,
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
          content: '<p>Exercice</p>',
          defaultFontName: '',
          defaultColor: '#000000',
          rotate: 0,
        },
      ],
    };
    const aiCall = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'text',
            content: 'Téléchargez le fichier d’exercice grâce au QR code affiché.',
          },
        ]),
      )
      .mockResolvedValueOnce(
        JSON.stringify([{ type: 'text', content: 'Appliquez maintenant la méthode.' }]),
      );

    const actions = await generateSceneActions(outline, content, aiCall, {
      languageDirective: 'Deliver the entire course in French.',
    });

    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(
      actions.some(
        (action) =>
          action.type === 'speech' && /télécharg|QR code|fichier d’exercice/i.test(action.text),
      ),
    ).toBe(false);
  });
});

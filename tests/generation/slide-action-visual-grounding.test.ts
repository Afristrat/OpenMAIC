import { describe, expect, it, vi } from 'vitest';

import { generateSceneActions } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'scene-visual-grounding',
  type: 'slide',
  title: 'Principes clés et gaspillages',
  description: 'Présenter les principes du Lean.',
  keyPoints: ['Amélioration continue', 'Réduction des gaspillages'],
  order: 3,
};

const content: GeneratedSlideContent = {
  elements: [
    {
      id: 'text-principles',
      type: 'text',
      left: 60,
      top: 120,
      width: 420,
      height: 180,
      rotate: 0,
      content: '<p>Amélioration continue, réduction des gaspillages</p>',
      defaultFontName: 'Arial',
      defaultColor: '#111111',
    },
    {
      id: 'decorative-shape',
      type: 'shape',
      left: 560,
      top: 150,
      width: 260,
      height: 260,
      rotate: 0,
      path: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
      viewBox: [1, 1],
      fixedRatio: false,
      fill: '#ffff00',
    },
  ],
  background: undefined,
  remark: '',
};

describe('slide action visual grounding', () => {
  it('régénère une narration qui prétend montrer un tableau absent', async () => {
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'action',
            name: 'spotlight',
            params: { elementId: 'decorative-shape' },
          },
          {
            type: 'text',
            content: 'Regardons ce tableau qui détaille les huit gaspillages.',
          },
        ]),
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'action',
            name: 'spotlight',
            params: { elementId: 'text-principles' },
          },
          {
            type: 'text',
            content: 'Examinons ces principes et leurs effets concrets.',
          },
        ]),
      );

    const actions = await generateSceneActions(outline, content, aiCall, {
      languageDirective: 'French (fr-FR)',
    });

    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(aiCall.mock.calls[0]?.[0]).toContain('Visible element types: text, shape');
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'speech',
          text: 'Examinons ces principes et leurs effets concrets.',
        }),
      ]),
    );
    expect(actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/ce tableau/i) }),
      ]),
    );
    expect(aiCall.mock.calls[1]?.[0]).toContain('tableau');
  });

  it('refuse de décrire un schéma absent même si une image générique existe', async () => {
    const withImage: GeneratedSlideContent = {
      ...content,
      elements: [
        ...content.elements,
        {
          id: 'source-image',
          type: 'image',
          src: '/api/classroom-media/course/media/source.png',
          left: 500,
          top: 120,
          width: 300,
          height: 240,
          rotate: 0,
          fixedRatio: true,
        },
      ],
    };
    const aiCall = vi
      .fn<AICallFn>()
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'text',
            content: 'Comme vous pouvez le voir sur ce schéma, le SIPOC comporte cinq colonnes.',
          },
        ]),
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'text',
            content: 'Le SIPOC relie les fournisseurs, entrées, processus, sorties et clients.',
          },
        ]),
      );

    const actions = await generateSceneActions(outline, withImage, aiCall, {
      languageDirective: 'French (fr-FR)',
    });

    expect(aiCall).toHaveBeenCalledTimes(2);
    expect(aiCall.mock.calls[1]?.[0]).toContain('schéma');
    expect(actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/ce schéma/i) }),
      ]),
    );
  });
});

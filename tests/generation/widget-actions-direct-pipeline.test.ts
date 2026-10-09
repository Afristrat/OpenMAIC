import { describe, expect, it } from 'vitest';

import { generateSceneActions, generateSceneContent } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GeneratedInteractiveContent, SceneOutline } from '@/lib/types/generation';

function baseInteractiveOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-widget',
    type: 'interactive',
    title: 'Energy Widget',
    description: 'Explore how energy changes with the slider.',
    keyPoints: ['Observe the slider', 'Set a higher energy value', 'Reveal the formula'],
    order: 0,
    widgetType: 'simulation',
    widgetOutline: { concept: 'Energy transfer', keyVariables: ['energy'] },
    ...overrides,
  };
}

describe('widget actions direct pipeline', () => {
  it('generates widget content without a second teacherActions call', async () => {
    const capturedUsers: string[] = [];
    const aiCall: AICallFn = async (_system, user) => {
      capturedUsers.push(user);
      return '<!DOCTYPE html><html><body><div id="energy-slider"></div></body></html>';
    };

    const content = await generateSceneContent(baseInteractiveOutline(), aiCall, {
      languageDirective: 'Teach in English.',
    });

    expect(capturedUsers).toHaveLength(1);
    expect(content).toMatchObject({
      html: expect.stringContaining('energy-slider'),
      widgetType: 'simulation',
    });
    expect(content && 'teacherActions' in content).toBe(false);
  });

  it('adds design tokens and the bounded design module to opted-in interactive scenes', async () => {
    let capturedSystem = '';
    const aiCall: AICallFn = async (system) => {
      capturedSystem = system;
      return '<!DOCTYPE html><html><head></head><body><button>Explore</button></body></html>';
    };

    const content = await generateSceneContent(baseInteractiveOutline(), aiCall, {
      designDirective: {
        version: 1,
        source: 'derived',
        tone: 'sober',
        density: 'balanced',
        seed: { hueFamily: 'blue', chromaLevel: 'low' },
        palette: null,
        typography: { heading: 'Inter', body: 'Open Sans', scaleShift: 0 },
        grid: { margin: 72 },
        shapes: { radius: 8, stroke: 'hairline' },
        surfacePlan: { content: 'base', engagement: 'tint', punchline: 'none' },
        accentSequence: 'primary-only',
        forbidden: [],
        notes: '',
      },
    });

    expect(capturedSystem).toContain('DESIGN SYSTEM QALEM');
    expect(content && 'html' in content ? content.html : '').toContain('id="qalem-design-tokens"');
    expect(content && 'html' in content ? content.html : '').toContain('--q-font-body');
  });

  it.each(['simulation', 'diagram', 'game', 'code', 'visualization3d'] as const)(
    'applies the design system to the %s generator only when enabled',
    async (widgetType) => {
      let capturedSystem = '';
      const aiCall: AICallFn = async (system) => {
        capturedSystem = system;
        return '<!DOCTYPE html><html><body><main>Static state</main></body></html>';
      };
      const outline = baseInteractiveOutline({
        widgetType,
        widgetOutline: { concept: 'Learning concept' },
      });

      const legacy = await generateSceneContent(outline, aiCall);
      expect(capturedSystem).not.toContain('DESIGN SYSTEM QALEM');
      expect(legacy && 'html' in legacy ? legacy.html : '').not.toContain('qalem-design-tokens');

      const themed = await generateSceneContent(outline, aiCall, {
        designDirective: {
          version: 1,
          source: 'derived',
          tone: 'sober',
          density: 'balanced',
          seed: { hueFamily: 'blue', chromaLevel: 'low' },
          palette: null,
          typography: { heading: 'Inter', body: 'Open Sans', scaleShift: 0 },
          grid: { margin: 72 },
          shapes: { radius: 8, stroke: 'hairline' },
          surfacePlan: { content: 'base', engagement: 'tint', punchline: 'none' },
          accentSequence: 'primary-only',
          forbidden: [],
          notes: '',
        },
      });
      expect(capturedSystem).toContain('DESIGN SYSTEM QALEM');
      expect(themed && 'html' in themed ? themed.html : '').toContain('id="qalem-design-tokens"');
    },
  );

  it('uses interactive action generation directly and preserves all four widget action types', async () => {
    const capturedUsers: string[] = [];
    const aiCall: AICallFn = async (_system, user) => {
      capturedUsers.push(user);
      return JSON.stringify([
        {
          type: 'action',
          name: 'widget_highlight',
          params: { target: '#energy-slider', content: 'Watch this control first.' },
        },
        {
          type: 'action',
          name: 'widget_setState',
          params: { state: { energy: 82 }, content: 'Set energy to a high value.' },
        },
        {
          type: 'action',
          name: 'widget_annotation',
          params: { target: '#result-card', content: 'This result reflects the new state.' },
        },
        {
          type: 'action',
          name: 'widget_reveal',
          params: { target: '#hidden-formula', content: 'Reveal the formula behind it.' },
        },
      ]);
    };
    const legacyContent = {
      html: '<!DOCTYPE html><html><body><div id="energy-slider"></div></body></html>',
      widgetType: 'simulation',
      teacherActions: [
        {
          id: 'legacy-highlight',
          type: 'highlight',
          target: '#legacy',
          content: 'Legacy action should be ignored.',
        },
      ],
    } as unknown as GeneratedInteractiveContent;

    const actions = await generateSceneActions(baseInteractiveOutline(), legacyContent, aiCall, {
      languageDirective: 'Teach in English.',
    });

    expect(capturedUsers).toHaveLength(1);
    expect(capturedUsers[0]).toContain('widget_highlight');
    expect(actions.map((action) => action.type)).toEqual([
      'widget_highlight',
      'widget_setState',
      'widget_annotation',
      'widget_reveal',
    ]);
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'widget_highlight',
        target: '#energy-slider',
        content: 'Watch this control first.',
      }),
      expect.objectContaining({
        type: 'widget_setState',
        state: { energy: 82 },
        content: 'Set energy to a high value.',
      }),
      expect.objectContaining({
        type: 'widget_annotation',
        target: '#result-card',
        content: 'This result reflects the new state.',
      }),
      expect.objectContaining({
        type: 'widget_reveal',
        target: '#hidden-formula',
        content: 'Reveal the formula behind it.',
      }),
    ]);
  });

  it('defaults widget_setState.state to {} when the LLM omits it', async () => {
    const aiCall: AICallFn = async () =>
      JSON.stringify([
        {
          type: 'action',
          name: 'widget_setState',
          params: { content: 'Update the widget.' },
        },
      ]);
    const content = {
      html: '<!DOCTYPE html><html><body></body></html>',
      widgetType: 'simulation',
    } as unknown as GeneratedInteractiveContent;

    const actions = await generateSceneActions(baseInteractiveOutline(), content, aiCall, {
      languageDirective: 'Teach in English.',
    });

    expect(actions).toEqual([
      expect.objectContaining({
        type: 'widget_setState',
        state: {},
        content: 'Update the widget.',
      }),
    ]);
  });
});

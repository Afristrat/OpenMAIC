import { describe, expect, it, vi } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';
import { generateSceneContent, generateSceneActions } from '@/lib/generation/scene-generator';
import { buildCompleteScene } from '@/lib/generation/scene-builder';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'plugin-outline-1',
  type: 'plugin',
  pluginType: 'code-sandbox',
  title: 'Fonction somme',
  description: 'Appliquer les paramètres et le retour d’une fonction.',
  keyPoints: ['paramètres', 'valeur de retour'],
  order: 1,
};

describe('plugin scene generation', () => {
  it('generates manifest-valid data and a teaching introduction', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        language: 'javascript',
        title: 'Fonction somme',
        instructions: 'Complétez la fonction puis exécutez les tests.',
        starterCode: 'function sum(a, b) { /* TODO */ }',
        solution: 'function sum(a, b) { return a + b; }',
        tests: [{ name: 'entiers positifs', input: 'sum(2, 3)', expected: '5' }],
      }),
    );

    const content = await generateSceneContent(outline, aiCall, {
      languageDirective: 'Teach in French.',
    });

    expect(content).toMatchObject({
      pluginType: 'code-sandbox',
      data: { language: 'javascript', title: 'Fonction somme' },
    });
    expect(aiCall).toHaveBeenCalledOnce();
    expect(aiCall.mock.calls[0][1]).toContain('Teach in French.');

    if (!content || !('pluginType' in content)) return;
    const actions = await generateSceneActions(outline, content, aiCall);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'speech', text: outline.description });

    const scene = buildCompleteScene(outline, content, actions, 'stage-plugin-test');
    expect(scene).toMatchObject({
      stageId: 'stage-plugin-test',
      type: 'plugin',
      content: {
        type: 'plugin',
        pluginType: 'code-sandbox',
        data: { language: 'javascript', title: 'Fonction somme' },
      },
    });
  });

  it('rejects model output that does not conform to the manifest', async () => {
    expectConsoleMessages({
      error: ['[ERROR] [Generation] Generated data for plugin "code-sandbox" is invalid: $.title is required'],
    });
    const aiCall = vi.fn().mockResolvedValue('{"language":"ruby"}');
    await expect(generateSceneContent(outline, aiCall)).resolves.toBeNull();
  });
});

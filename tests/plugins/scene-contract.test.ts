import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PluginSceneContent } from '@/lib/plugins/scene-sdk';
import type { Scene } from '@/lib/types/stage';

describe('plugin scene contract', () => {
  it('persists plugin identity and generated data in a regular classroom scene', () => {
    const content: PluginSceneContent = {
      type: 'plugin',
      pluginType: 'code-sandbox',
      data: {
        language: 'javascript',
        title: 'Fonction somme',
        instructions: 'Complétez la fonction.',
      },
    };
    const scene: Scene = {
      id: 'plugin-scene-1',
      stageId: 'stage-1',
      type: 'plugin',
      title: 'Atelier de code',
      order: 1,
      content,
    };

    expect(scene.content).toEqual(content);
    expectTypeOf(content).toMatchTypeOf<PluginSceneContent>();
  });
});

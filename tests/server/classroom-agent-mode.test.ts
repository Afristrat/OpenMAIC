import { describe, expect, test } from 'vitest';
import { DEFAULT_LEARNING_DESIGN, buildTenantAgentConfigs } from '@/lib/agents/persona-catalog';
import { getDefaultAgents } from '@/lib/orchestration/registry/store';

describe('classroom agent modes', () => {
  test('default mode keeps the six built-in compatibility agents', () => {
    expect(getDefaultAgents().map((agent) => agent.id)).toEqual([
      'default-1',
      'default-2',
      'default-3',
      'default-4',
      'default-5',
      'default-6',
    ]);
  });

  test('generate mode instantiates the ten tenant pedagogical mechanisms', () => {
    const configs = buildTenantAgentConfigs(
      DEFAULT_LEARNING_DESIGN,
      'Use andragogy for adult professionals.',
    );

    expect(configs).toHaveLength(10);
    expect(configs.filter((agent) => agent.role === 'teacher')).toHaveLength(1);
    expect(configs.map((agent) => agent.mechanismId)).toEqual([
      'professor',
      'teaching-assistant',
      'joker',
      'curious',
      'secretary',
      'thinker',
      'analyst',
      'coach',
      'devils-advocate',
      'creative',
    ]);
  });

  test('uses the selected interaction matrix without changing the personas', () => {
    const immersive = buildTenantAgentConfigs(
      { ...DEFAULT_LEARNING_DESIGN, interactionLevel: 'immersive' },
      'Immersive mode.',
    );

    expect(immersive.find((agent) => agent.mechanismId === 'professor')?.interactionWeight).toBe(
      20,
    );
    expect(
      immersive.find((agent) => agent.mechanismId === 'devils-advocate')?.interactionWeight,
    ).toBe(9);
  });
});

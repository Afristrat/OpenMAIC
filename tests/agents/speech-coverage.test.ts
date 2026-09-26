import { describe, expect, it } from 'vitest';
import { ensurePersistedSpeechCoverage } from '@/lib/agents/speech-coverage';
import type { Scene } from '@/lib/types/stage';

function scene(id: string, actions: Scene['actions'] = []): Scene {
  return {
    id,
    stageId: 'stage-1',
    type: 'slide',
    title: id,
    order: 1,
    content: { type: 'slide', canvas: {} as never },
    actions,
    createdAt: 1,
    updatedAt: 1,
  };
}

const agents = [
  { id: 'persona-professor', name: 'Hanae', role: 'teacher', mechanismId: 'professor' },
  { id: 'persona-analyst', name: 'Khalid', role: 'assistant', mechanismId: 'analyst' },
  { id: 'persona-creative', name: 'Layla', role: 'student', mechanismId: 'creative' },
];

describe('ensurePersistedSpeechCoverage', () => {
  it('adds a localized, canonical intervention for every silent active agent', () => {
    const result = ensurePersistedSpeechCoverage(
      [
        scene('scene-1', [
          {
            id: 'teacher-line',
            type: 'speech',
            text: 'Introduction.',
            agentId: 'persona-professor',
          },
          {
            id: 'discussion',
            type: 'discussion',
            topic: 'Échangez.',
            agentId: 'persona-analyst',
          },
        ]),
        scene('scene-2'),
      ],
      agents,
      'fr-FR',
    );

    expect(result.insertedAgentIds).toEqual(['persona-analyst', 'persona-creative']);
    const speechByAgent = new Map(
      result.scenes.flatMap(({ actions = [] }) =>
        actions
          .filter((action) => action.type === 'speech')
          .map((action) => [action.agentId, action] as const),
      ),
    );
    expect(speechByAgent.get('persona-analyst')).toMatchObject({
      interventionForm: 'challenge',
    });
    expect(speechByAgent.get('persona-creative')).toMatchObject({
      interventionForm: 'example',
    });
    expect(speechByAgent.get('persona-creative')?.text).toContain('autre piste');
    expect(result.scenes[0].actions?.at(-1)?.type).toBe('discussion');
  });

  it('leaves scenes unchanged when every active agent already speaks', () => {
    const original = [
      scene(
        'scene-1',
        agents.map((agent) => ({
          id: `line-${agent.id}`,
          type: 'speech' as const,
          text: agent.name,
          agentId: agent.id,
        })),
      ),
    ];

    const result = ensurePersistedSpeechCoverage(original, agents, 'fr-FR');

    expect(result.insertedAgentIds).toEqual([]);
    expect(result.scenes).toBe(original);
  });
});

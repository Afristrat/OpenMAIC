import { describe, expect, it } from 'vitest';
import { createAnimationConstitution } from '@/lib/formation-engine/animation-constitution';
import { buildStageExtra, extractStageLiveContext } from '@/lib/server/classroom-storage';
import type { GeneratedAgentConfig, Scene, Stage } from '@/lib/types/stage';

describe('classroom animation persistence', () => {
  it('round-trips the server-owned constitution through stage.extra', () => {
    const constitution = createAnimationConstitution({
      classroomId: 'classroom-1',
      organizationId: 'org-1',
      authorUserId: 'author-1',
      authorRole: 'author',
      approach: 'hybrid',
      interactionLevel: 'balanced',
      targetPerformance: 'Défendre un choix de routage LiteLLM dans une situation réelle.',
      scenes: [
        { id: 'scene-1', stageId: 'classroom-1', type: 'slide', title: 'Routage', order: 0 },
      ] as Scene[],
      agents: [
        {
          id: 'persona-analyst',
          name: 'Khalid',
          role: 'assistant',
          persona: 'Met les hypothèses à l’épreuve.',
          avatar: '/avatars/note-taker-2.png',
          color: '#6366f1',
          priority: 8,
          interactionWeight: 8,
          mechanismId: 'analyst',
          gender: 'male',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'khalid' },
        },
      ] as GeneratedAgentConfig[],
    });
    const stage = {
      id: 'classroom-1',
      name: 'LiteLLM',
      createdAt: 1,
      updatedAt: 1,
      skillPromptContext: { enabled: true, activeSkillId: 'formation-design-pro' },
    } as Stage;

    const extra = buildStageExtra(stage, constitution);
    const restored = extractStageLiveContext(JSON.parse(JSON.stringify(extra)));

    expect(restored.context).toEqual(stage.skillPromptContext);
    expect(restored.animationConstitution).toEqual(constitution);
    expect(restored.animationConstitution?.authoredBy).toMatchObject({
      role: 'author',
      organizationId: 'org-1',
    });
  });

  it('drops a corrupted constitution instead of trusting database JSON blindly', () => {
    const restored = extractStageLiveContext({
      skillPromptContext: { enabled: true },
      animationConstitution: { schemaVersion: 1, approach: 'invented' },
    });

    expect(restored.context).toEqual({ enabled: true });
    expect(restored.animationConstitution).toBeUndefined();
  });
});

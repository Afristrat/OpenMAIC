import { describe, expect, it } from 'vitest';
import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import type { GeneratedAgentConfig, Scene, Stage } from '@/lib/types/stage';

const hanae: GeneratedAgentConfig = {
  id: 'persona-professor',
  name: 'Hanae',
  role: 'teacher',
  persona: 'Professeure principale',
  avatar: '/avatars/teacher-2.png',
  color: '#3b82f6',
  priority: 10,
  gender: 'female',
  voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
};

function stage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'classroom-1',
    name: 'Formation',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function scenes(agentId?: string): Scene[] {
  return [
    {
      id: 'scene-1',
      stageId: 'classroom-1',
      order: 1,
      type: 'slide',
      title: 'Introduction',
      content: {
        type: 'slide',
        canvas: {
          id: 'canvas-1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#111827'],
            fontColor: '#111827',
            fontName: 'Inter',
          },
          elements: [],
        },
      },
      actions: [{ id: 'speech-1', type: 'speech', text: 'Bienvenue.', agentId }],
    },
  ];
}

describe('casting vocal canonique d’une classroom', () => {
  it('projette le professeur du casting sur le profil et attribue les paroles orphelines', () => {
    const result = normalizeClassroomCasting(
      stage({
        teacherProfile: {
          name: 'Younes',
          avatar: '/avatars/teacher.png',
          providerId: 'higgs-tts',
          voiceId: 'younes',
        },
        generatedAgentConfigs: [hanae],
      }),
      scenes(),
    );

    expect(result).not.toBeNull();
    expect(result?.teacherProfile).toEqual({
      name: 'Hanae',
      avatar: '/avatars/teacher-2.png',
      providerId: 'higgs-tts',
      voiceId: 'hanae',
    });
    expect(result?.scenes[0].actions?.[0]).toMatchObject({ agentId: 'persona-professor' });
    expect(result?.changed).toBe(true);
  });

  it('promeut un profil historique complet en casting persistant', () => {
    const result = normalizeClassroomCasting(
      stage({
        teacherProfile: {
          name: 'Hanae',
          avatar: '/avatars/teacher-2.png',
          providerId: 'higgs-tts',
          voiceId: 'hanae',
        },
      }),
      scenes('teacher-id'),
    );

    expect(result?.agents).toEqual([
      expect.objectContaining({ id: 'legacy-professor', gender: 'female', role: 'teacher' }),
    ]);
    expect(result?.scenes[0].actions?.[0]).toMatchObject({ agentId: 'legacy-professor' });
  });

  it('restaure une voix historique uniquement depuis un avatar de persona non ambigu', () => {
    const result = normalizeClassroomCasting(
      stage({
        generatedAgentConfigs: [
          {
            ...hanae,
            id: 'gen-server-0',
            name: 'Karim Benali',
            avatar: '/avatars/teacher.png',
            gender: undefined,
            voiceConfig: undefined,
          },
        ],
      }),
      scenes('gen-server-0'),
    );

    expect(result?.agents[0]).toMatchObject({
      gender: 'male',
      mechanismId: 'professor',
      voiceConfig: { providerId: 'higgs-tts', voiceId: 'younes' },
    });
  });

  it('refuse un avatar masculin associé à une voix féminine connue', () => {
    expect(() =>
      normalizeClassroomCasting(
        stage({ generatedAgentConfigs: [{ ...hanae, avatar: '/avatars/teacher.png' }] }),
        scenes('persona-professor'),
      ),
    ).toThrow(ClassroomCastingError);
  });

  it('ne fabrique aucune identité lorsque la classroom ne contient aucune source fiable', () => {
    expect(normalizeClassroomCasting(stage(), scenes())).toBeNull();
  });
});

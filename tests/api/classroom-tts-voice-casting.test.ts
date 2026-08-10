import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  persistClassroom: vi.fn(),
  readClassroom: vi.fn(),
  readOwnership: vi.fn(),
  requireEditor: vi.fn(),
  organizationSingle: vi.fn(),
}));

vi.mock('@/lib/server/classroom-media-generation', () => ({
  generateTTSForClassroom: mocks.generateTTS,
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  buildRequestOrigin: () => 'https://qalem.ma',
  isValidClassroomId: () => true,
  persistClassroom: mocks.persistClassroom,
  readClassroom: mocks.readClassroom,
  readClassroomOwnership: mocks.readOwnership,
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgEditor: mocks.requireEditor,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mocks.organizationSingle }),
      }),
    }),
  }),
}));

vi.mock('@/lib/agents/persona-catalog', () => ({
  learningDesignFromSettings: () => ({ personas: [] }),
}));

vi.mock('@/lib/org/teaching-profile', () => ({
  teachingProfileFromLearningDesign: () => ({
    name: 'Younes organisation',
    avatar: '/avatars/teacher.png',
    providerId: 'higgs-tts',
    voiceId: 'younes',
  }),
}));

import { POST as regenerateOneSpeech } from '@/app/api/classroom/[classroomId]/tts/route';
import { POST as regenerateClassroomSpeech } from '@/app/api/classroom/[classroomId]/tts/regenerate/route';

const teacherProfile = {
  name: 'Hanae',
  avatar: '/avatars/teacher-2.png',
  providerId: 'higgs-tts',
  voiceId: 'hanae',
};

const generatedAgentConfigs = [
  {
    id: 'persona-professor',
    name: 'Hanae',
    avatar: '/avatars/teacher-2.png',
    voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
  },
];

function classroom() {
  return {
    id: 'classroom-1',
    ownerId: 'owner-1',
    orgId: 'org-1',
    createdAt: '2026-08-10T00:00:00.000Z',
    stage: {
      id: 'classroom-1',
      name: 'Formation',
      teacherProfile,
      generatedAgentConfigs,
    },
    scenes: [
      {
        id: 'scene-1',
        stageId: 'classroom-1',
        order: 1,
        type: 'slide',
        title: 'Introduction',
        content: { type: 'slide', canvas: { elements: [] } },
        actions: [
          {
            id: 'speech-1',
            type: 'speech',
            agentId: 'persona-professor',
            text: 'Bienvenue dans cette formation.',
          },
        ],
      },
    ],
  };
}

describe('régénération TTS et casting persistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readOwnership.mockResolvedValue({ ownerId: 'owner-1', orgId: 'org-1' });
    mocks.requireEditor.mockResolvedValue({ response: null });
    mocks.organizationSingle.mockResolvedValue({ data: { settings: {} } });
    mocks.readClassroom.mockImplementation(async () => classroom());
    mocks.persistClassroom.mockResolvedValue({});
    mocks.generateTTS.mockImplementation(async (scenes: Array<{ actions?: unknown[] }>) => {
      for (const scene of scenes) {
        scene.actions = (scene.actions ?? []).map((action) => ({
          ...(action as object),
          audioUrl: '/api/classroom-media/classroom-1/audio/voice.wav?v=female',
        }));
      }
      return { requested: 1, generated: 1 };
    });
  });

  it('conserve la voix de la professeure pour une seule prise de parole', async () => {
    const response = await regenerateOneSpeech(
      new NextRequest('https://qalem.ma/api/classroom/classroom-1/tts', {
        method: 'POST',
        body: JSON.stringify({
          sceneId: 'scene-1',
          actionId: 'speech-1',
          text: 'Bienvenue dans cette formation.',
        }),
      }),
      { params: Promise.resolve({ classroomId: 'classroom-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.generateTTS).toHaveBeenCalledWith(
      expect.any(Array),
      'classroom-1',
      teacherProfile,
      generatedAgentConfigs,
    );
  });

  it('conserve le même casting pour la régénération complète', async () => {
    const response = await regenerateClassroomSpeech(
      new NextRequest('https://qalem.ma/api/classroom/classroom-1/tts/regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ classroomId: 'classroom-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.generateTTS).toHaveBeenCalledWith(
      expect.any(Array),
      'classroom-1',
      teacherProfile,
      generatedAgentConfigs,
    );
  });
});

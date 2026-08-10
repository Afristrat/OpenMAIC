import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  persistClassroom: vi.fn(),
  readClassroom: vi.fn(),
  readOwnership: vi.fn(),
  requireEditor: vi.fn(),
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

import { POST as regenerateOneSpeech } from '@/app/api/classroom/[classroomId]/tts/route';
import { POST as regenerateClassroomSpeech } from '@/app/api/classroom/[classroomId]/tts/regenerate/route';

const staleTeacherProfile = {
  name: 'Younes',
  avatar: '/avatars/teacher.png',
  providerId: 'higgs-tts',
  voiceId: 'younes',
};

const canonicalTeacherProfile = {
  name: 'Hanae',
  avatar: '/avatars/teacher-2.png',
  providerId: 'higgs-tts',
  voiceId: 'hanae',
};

const generatedAgentConfigs = [
  {
    id: 'persona-professor',
    name: 'Hanae',
    role: 'teacher',
    persona: 'Professeure principale',
    avatar: '/avatars/teacher-2.png',
    color: '#3b82f6',
    priority: 10,
    gender: 'female' as const,
    voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
  },
];

function classroom(options?: { withoutCasting?: boolean; legacyProfileOnly?: boolean }) {
  return {
    id: 'classroom-1',
    ownerId: 'owner-1',
    orgId: 'org-1',
    createdAt: '2026-08-10T00:00:00.000Z',
    stage: {
      id: 'classroom-1',
      name: 'Formation',
      ...(options?.withoutCasting
        ? {}
        : options?.legacyProfileOnly
          ? { teacherProfile: canonicalTeacherProfile }
          : {
              teacherProfile: staleTeacherProfile,
              generatedAgentConfigs,
            }),
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
      canonicalTeacherProfile,
      generatedAgentConfigs,
    );
    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: expect.objectContaining({ teacherProfile: canonicalTeacherProfile }),
        scenes: [
          expect.objectContaining({
            actions: [expect.objectContaining({ agentId: 'persona-professor' })],
          }),
        ],
      }),
      'https://qalem.ma',
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
      canonicalTeacherProfile,
      generatedAgentConfigs,
    );
  });

  it('refuse une régénération quand aucune identité vocale persistante n’existe', async () => {
    mocks.readClassroom.mockResolvedValueOnce(classroom({ withoutCasting: true }));

    const response = await regenerateClassroomSpeech(
      new NextRequest('https://qalem.ma/api/classroom/classroom-1/tts/regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ classroomId: 'classroom-1' }) },
    );

    expect(response.status).toBe(422);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  it('transforme un ancien profil vocal complet en casting persistant', async () => {
    mocks.readClassroom.mockResolvedValueOnce(classroom({ legacyProfileOnly: true }));

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
      canonicalTeacherProfile,
      [
        expect.objectContaining({
          id: 'legacy-professor',
          role: 'teacher',
          name: 'Hanae',
          gender: 'female',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
        }),
      ],
    );
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

const mocks = vi.hoisted(() => ({
  readClassroom: vi.fn(),
  persistClassroom: vi.fn(),
  generateTTS: vi.fn(),
  casting: vi.fn(),
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroom: mocks.readClassroom,
  persistClassroom: mocks.persistClassroom,
}));
vi.mock('@/lib/server/classroom-media-generation', () => ({
  generateTTSForClassroom: mocks.generateTTS,
}));
vi.mock('@/lib/agents/classroom-casting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agents/classroom-casting')>()),
  normalizeClassroomCasting: mocks.casting,
}));

import {
  completeMissingSpeechAudio,
  VoiceCompletionError,
} from '@/lib/server/classroom-voice-completion';

const speech = (id: string, audioUrl?: string): Action =>
  ({ id, type: 'speech', text: `Texte ${id}`, ...(audioUrl ? { audioUrl } : {}) }) as Action;

function scenes(): Scene[] {
  return [
    { id: 'sc1', order: 1, actions: [speech('a'), speech('b', '/b.mp3'), speech('c')] },
    { id: 'sc2', order: 2, actions: [speech('d')] },
  ] as unknown as Scene[];
}

const input = {
  classroomId: 'room-1',
  ownerId: 'owner',
  orgId: 'org',
  baseUrl: 'https://qalem.test',
  assertAccess: vi.fn().mockResolvedValue(undefined),
};

describe('completeMissingSpeechAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readClassroom.mockResolvedValue({ stage: { id: 'room-1' }, scenes: scenes() });
    mocks.casting.mockImplementation((stage: unknown, list: Scene[]) => ({
      stage,
      scenes: list,
      agents: [],
      teacherProfile: undefined,
    }));
  });

  test('voices only the silent lines, one by one, and persists what succeeded', async () => {
    mocks.generateTTS.mockImplementation(async (list: Scene[]) => {
      const action = list[0].actions?.[0] as Action & { audioUrl?: string };
      action.audioUrl = `/${action.id}.mp3`;
    });

    const report = await completeMissingSpeechAudio(input);

    expect(report).toMatchObject({ requested: 3, generated: 3, failed: [] });
    expect(mocks.generateTTS).toHaveBeenCalledTimes(3);
    expect(report.updatedScenes.map((scene) => scene.id)).toEqual(['sc1', 'sc2']);
    const persisted = mocks.persistClassroom.mock.calls[0][0] as { scenes: Scene[] };
    expect(
      persisted.scenes.flatMap((scene) => scene.actions ?? []).every((a) => 'audioUrl' in a),
    ).toBe(true);
  });

  test('a failing line stays silent, is reported, and does not cost the others', async () => {
    mocks.generateTTS.mockImplementation(async (list: Scene[]) => {
      const action = list[0].actions?.[0] as Action & { audioUrl?: string };
      if (action.id === 'c') throw new Error('INVALID_USAGE_RESERVATION');
      action.audioUrl = `/${action.id}.mp3`;
    });

    const report = await completeMissingSpeechAudio(input);

    expect(report.requested).toBe(3);
    expect(report.generated).toBe(2);
    expect(report.failed).toEqual([{ sceneId: 'sc1', actionId: 'c' }]);
    expect(mocks.persistClassroom).toHaveBeenCalledTimes(1);
  });

  test('limits the completion to one scene', async () => {
    mocks.generateTTS.mockImplementation(async (list: Scene[]) => {
      (list[0].actions?.[0] as Action & { audioUrl?: string }).audioUrl = '/x.mp3';
    });

    const report = await completeMissingSpeechAudio({ ...input, sceneId: 'sc2' });

    expect(report).toMatchObject({ requested: 1, generated: 1 });
    expect(report.updatedScenes.map((scene) => scene.id)).toEqual(['sc2']);
  });

  test('persists nothing when no line could be voiced', async () => {
    mocks.generateTTS.mockRejectedValue(new Error('provider down'));

    const report = await completeMissingSpeechAudio(input);

    expect(report.generated).toBe(0);
    expect(report.failed).toHaveLength(3);
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  test('refuses a classroom without vocal casting, with a clear reason', async () => {
    mocks.casting.mockReturnValue(null);
    await expect(completeMissingSpeechAudio(input)).rejects.toMatchObject({
      code: 'NO_CASTING',
    });
    await expect(completeMissingSpeechAudio(input)).rejects.toBeInstanceOf(VoiceCompletionError);
  });

  test('refuses an unknown scene', async () => {
    await expect(completeMissingSpeechAudio({ ...input, sceneId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

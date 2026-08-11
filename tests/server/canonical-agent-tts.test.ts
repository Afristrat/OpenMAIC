import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scene } from '@/lib/types/stage';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/audio/tts-providers', () => ({
  generateTTS: mocks.generateTTS,
}));

vi.mock('@/lib/server/provider-config', () => ({
  getServerImageProviders: vi.fn(() => ({})),
  getServerVideoProviders: vi.fn(() => ({})),
  getServerTTSProviders: vi.fn(() => ({ 'higgs-tts': { disabled: false } })),
  resolveImageApiKey: vi.fn(),
  resolveImageBaseUrl: vi.fn(),
  resolveVideoApiKey: vi.fn(),
  resolveVideoBaseUrl: vi.fn(),
  resolveTTSApiKey: vi.fn(() => 'test-key'),
  resolveTTSBaseUrl: vi.fn(() => 'http://tts.test'),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ upload: mocks.upload })),
    },
  })),
}));

import {
  generateTTSForClassroom,
  removeAgentNamesFromSpeech,
  removeUnresolvedMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';

describe('canonical classroom agent TTS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateTTS.mockResolvedValue({ audio: Buffer.from('wav'), format: 'wav' });
    mocks.upload.mockResolvedValue({ error: null });
  });

  test('synthesizes an authored intervention with the speaking agent voice', async () => {
    const scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'Hypothèses',
      order: 1,
      content: { type: 'slide', canvas: { id: 'canvas-1', elements: [] } },
      actions: [
        {
          id: 'speech-1',
          type: 'speech',
          text: 'Et si cette hypothèse était fausse ?',
          agentId: 'agent-analyst',
          interventionId: 'scene-1-objection',
          interventionForm: 'objection',
        },
      ],
    } as unknown as Scene;

    await generateTTSForClassroom(
      [scene],
      'classroom-1',
      { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
      [
        {
          id: 'agent-analyst',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'analyst-voice' },
        },
      ],
    );

    expect(mocks.generateTTS).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'higgs-tts', voice: 'analyst-voice' }),
      'Et si cette hypothèse était fausse ?',
    );
    expect(scene.actions?.[0]).toMatchObject({
      agentId: 'agent-analyst',
      audioUrl: expect.stringMatching(
        /^\/api\/classroom-media\/classroom-1\/audio\/tts_s1_speech-1\.wav\?v=[a-f0-9]{12}$/,
      ),
    });
  });

  test('refuse de remplacer silencieusement un agent inconnu par la voix du professeur', async () => {
    const scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'Casting invalide',
      order: 1,
      content: { type: 'slide', canvas: { id: 'canvas-1', elements: [] } },
      actions: [
        {
          id: 'speech-1',
          type: 'speech',
          text: 'Cette voix ne doit pas être remplacée.',
          agentId: 'agent-inconnu',
        },
      ],
    } as unknown as Scene;

    await expect(
      generateTTSForClassroom(
        [scene],
        'classroom-1',
        { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
        [
          {
            id: 'persona-professor',
            voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
          },
        ],
      ),
    ).rejects.toThrow('agent-inconnu');
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  test('reports durable progress after every generated speech line', async () => {
    const scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'Progression',
      order: 1,
      content: { type: 'slide', canvas: { id: 'canvas-1', elements: [] } },
      actions: [
        { id: 'speech-1', type: 'speech', text: 'Première intervention.' },
        { id: 'speech-2', type: 'speech', text: 'Deuxième intervention.' },
      ],
    } as unknown as Scene;
    const onProgress = vi.fn();

    await generateTTSForClassroom(
      [scene],
      'classroom-1',
      { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
      [],
      onProgress,
    );

    expect(onProgress.mock.calls).toEqual([
      [{ completed: 1, total: 2 }],
      [{ completed: 2, total: 2 }],
    ]);
  });

  test('retire les prénoms des agents avant la synthèse et la persistance', async () => {
    const scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'SIPOC',
      order: 1,
      content: { type: 'slide', canvas: { id: 'canvas-1', elements: [] } },
      actions: [
        {
          id: 'speech-1',
          type: 'speech',
          text: 'Une remarque importante, Hanae : vérifions les frontières.',
          agentId: 'agent-analyst',
        },
        {
          id: 'speech-2',
          type: 'speech',
          text: 'Excellente précision, Khalid. Passons aux étapes.',
          agentId: 'agent-teacher',
        },
      ],
    } as unknown as Scene;

    await generateTTSForClassroom(
      [scene],
      'classroom-1',
      { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
      [
        {
          id: 'agent-teacher',
          name: 'Hanae',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'teacher-voice' },
        },
        {
          id: 'agent-analyst',
          name: 'Khalid',
          voiceConfig: { providerId: 'higgs-tts', voiceId: 'analyst-voice' },
        },
      ],
    );

    expect(mocks.generateTTS).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      'Une remarque importante : vérifions les frontières.',
    );
    expect(mocks.generateTTS).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      'Excellente précision. Passons aux étapes.',
    );
    expect(scene.actions?.map((action) => ('text' in action ? action.text : ''))).toEqual([
      'Une remarque importante : vérifions les frontières.',
      'Excellente précision. Passons aux étapes.',
    ]);
  });

  test('retire une auto-présentation entière sans laisser une phrase cassée', () => {
    expect(
      removeAgentNamesFromSpeech('Je suis Hanae, et je serai votre accompagnatrice.', [
        { id: 'teacher', name: 'Hanae' },
      ]),
    ).toBe('Je serai votre accompagnatrice.');
  });

  test('répare aussi la phrase située après une auto-présentation supprimée', () => {
    expect(
      removeAgentNamesFromSpeech(
        'Bienvenue aux entreprises marocaines. Je suis Hanae, et je serai votre accompagnatrice.',
        [{ id: 'teacher', name: 'Hanae' }],
      ),
    ).toBe('Bienvenue aux entreprises marocaines. Je serai votre accompagnatrice.');
  });

  test('retire seulement les placeholders des médias optionnels indisponibles', () => {
    const scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'Médias',
      order: 1,
      content: {
        type: 'slide',
        canvas: {
          id: 'canvas-1',
          elements: [
            { id: 'missing', type: 'image', src: 'gen_img_missing' },
            { id: 'source', type: 'image', src: '/api/classroom-media/source.png' },
            { id: 'text', type: 'text', content: '<p>Conserver</p>' },
          ],
        },
      },
    } as unknown as Scene;

    removeUnresolvedMediaPlaceholders([scene], new Set(['gen_img_missing']));

    expect(
      (scene.content as { canvas: { elements: Array<{ id: string }> } }).canvas.elements.map(
        (element) => element.id,
      ),
    ).toEqual(['source', 'text']);
  });
});

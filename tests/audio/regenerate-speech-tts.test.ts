import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTSEnablementConfig } from '@/lib/audio/provider-enablement';
import type { TTSProviderId } from '@/lib/audio/types';
import type { Scene } from '@/lib/types/stage';

const settings: {
  ttsEnabled: boolean;
  ttsProviderId: TTSProviderId;
  ttsProvidersConfig: Partial<Record<TTSProviderId, TTSEnablementConfig>>;
} = {
  ttsEnabled: true,
  ttsProviderId: 'openai-tts',
  ttsProvidersConfig: { 'openai-tts': { apiKey: 'configured' } },
};

const editorMocks = vi.hoisted(() => ({
  flush: vi.fn<() => Promise<boolean>>(),
  updateScene: vi.fn(),
  state: {
    stage: { id: 'classroom-1' },
    scenes: [] as Scene[],
  },
}));

vi.mock('@/lib/utils/database', () => ({ db: { audioFiles: {} } }));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: { getState: () => settings },
}));
vi.mock('@/lib/store/stage', () => ({
  useStageStore: {
    getState: () => ({ ...editorMocks.state, updateScene: editorMocks.updateScene }),
  },
}));
vi.mock('@/lib/edit/classroom-persistence', () => ({
  flushClassroomPersistence: editorMocks.flush,
}));

import {
  isManagedTtsActive,
  missingSpeechAudioActions,
  preflightMissingSpeechAudio,
  regenerateAllSceneSpeech,
  regenerateSpeechAudio,
} from '@/lib/audio/regenerate-speech-tts';

function scene(): Scene {
  return {
    id: 'scene-1',
    stageId: 'classroom-1',
    order: 1,
    title: 'Introduction',
    type: 'slide',
    content: { type: 'slide', canvas: { elements: [] } },
    actions: [
      { id: 'missing-1', type: 'speech', text: 'Première ligne' },
      { id: 'valid-id', type: 'speech', text: 'Déjà valide', audioId: 'audio-1' },
      { id: 'empty', type: 'speech', text: '   ' },
      { id: 'missing-2', type: 'speech', text: 'Deuxième ligne' },
      { id: 'valid-url', type: 'speech', text: 'Déjà distante', audioUrl: '/audio/2.wav' },
    ],
  } as unknown as Scene;
}

describe('managed speech preflight', () => {
  beforeEach(() => {
    settings.ttsEnabled = true;
    settings.ttsProviderId = 'openai-tts';
    settings.ttsProvidersConfig['openai-tts'] = { apiKey: 'configured' };
    editorMocks.flush.mockReset().mockResolvedValue(true);
    editorMocks.updateScene.mockReset();
    editorMocks.state.scenes = [];
    vi.unstubAllGlobals();
  });

  it('sends a stable idempotency key: the usage reservation refuses a request without one', async () => {
    const keys: Array<string | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        keys.push((init?.headers as Record<string, string> | undefined)?.['Idempotency-Key']);
        return new Response(JSON.stringify({ success: true, actions: [] }), { status: 200 });
      }),
    );

    await preflightMissingSpeechAudio(scene());

    expect(keys).toHaveLength(2);
    expect(
      keys.every(
        (key) => typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/.test(key),
      ),
    ).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });

  it('requests only missing non-empty lines, sequentially, and returns the final actions', async () => {
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;
    const finalActions = [
      { id: 'missing-2', type: 'speech' as const, text: 'Deuxième ligne', audioUrl: '/2' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const body = JSON.parse(String(init?.body)) as { actionId: string };
        calls.push(body.actionId);
        await Promise.resolve();
        active -= 1;
        return new Response(
          JSON.stringify({
            success: true,
            actions: body.actionId === 'missing-2' ? finalActions : [],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await preflightMissingSpeechAudio(scene());

    expect(calls).toEqual(['missing-1', 'missing-2']);
    expect(maxActive).toBe(1);
    // Seule la ligne effectivement voisée est remplacée, dans les actions de la scène.
    expect(result).toEqual(
      (scene().actions ?? []).map((action) =>
        action.id === 'missing-2' ? finalActions[0] : action,
      ),
    );
    expect(missingSpeechAudioActions(scene()).map((action) => action.id)).toEqual([
      'missing-1',
      'missing-2',
    ]);
  });

  it('does nothing for browser-native, disabled, or unavailable managed TTS', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    settings.ttsProviderId = 'browser-native-tts';
    expect(isManagedTtsActive()).toBe(false);
    expect(await preflightMissingSpeechAudio(scene())).toBeNull();

    settings.ttsProviderId = 'openai-tts';
    settings.ttsEnabled = false;
    expect(isManagedTtsActive()).toBe(false);

    settings.ttsEnabled = true;
    settings.ttsProvidersConfig['openai-tts'] = { apiKey: 'configured', enabled: false };
    expect(isManagedTtsActive()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails immediately and never requests a later line', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(preflightMissingSpeechAudio(scene())).rejects.toThrow(
      'La régénération de la voix off n’a pas pu être enregistrée.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes the current edit before requesting durable regenerated audio', async () => {
    const currentScene = scene();
    editorMocks.state.scenes = [currentScene];
    const order: string[] = [];
    editorMocks.flush.mockImplementation(async () => {
      order.push('flush');
      return true;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        order.push('tts');
        return new Response(JSON.stringify({ success: true, actions: currentScene.actions }), {
          status: 200,
        });
      }),
    );

    await expect(
      regenerateSpeechAudio(currentScene.order, currentScene.actions?.[0] ?? {}),
    ).resolves.toBe('tts_s1_missing-1');

    expect(order).toEqual(['flush', 'tts']);
    expect(editorMocks.updateScene).toHaveBeenCalledWith(currentScene.id, {
      actions: currentScene.actions,
    });
  });

  it('garde le texte modifié localement d’une autre ligne pendant la synthèse', async () => {
    const twoLines = (bText: string): Scene =>
      ({
        ...scene(),
        actions: [
          { id: 'A', type: 'speech', text: 'a1' },
          { id: 'B', type: 'speech', text: bText },
        ],
      }) as unknown as Scene;
    editorMocks.state.scenes = [twoLines('b1')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // L'auteur corrige B pendant que le serveur synthétise A.
        editorMocks.state.scenes = [twoLines('b2')];
        return new Response(
          JSON.stringify({
            success: true,
            actions: [
              { id: 'A', type: 'speech', text: 'a1', audioUrl: '/a.wav' },
              { id: 'B', type: 'speech', text: 'b1' },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    await regenerateSpeechAudio(1, { id: 'A', text: 'a1' });

    expect(editorMocks.updateScene).toHaveBeenCalledWith('scene-1', {
      actions: [
        { id: 'A', type: 'speech', text: 'a1', audioUrl: '/a.wav' },
        { id: 'B', type: 'speech', text: 'b2' },
      ],
    });
  });

  it('n’écrase pas la ligne régénérée si son texte a changé pendant la synthèse', async () => {
    const line = (text: string): Scene =>
      ({ ...scene(), actions: [{ id: 'A', type: 'speech', text }] }) as unknown as Scene;
    editorMocks.state.scenes = [line('a1')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        editorMocks.state.scenes = [line('a2')];
        return new Response(
          JSON.stringify({
            success: true,
            actions: [{ id: 'A', type: 'speech', text: 'a1', audioUrl: '/a.wav' }],
          }),
          { status: 200 },
        );
      }),
    );

    await expect(regenerateSpeechAudio(1, { id: 'A', text: 'a1' })).resolves.toBeNull();
    expect(editorMocks.updateScene).not.toHaveBeenCalled();
  });

  it('rend null sans rien écrire quand le serveur signale un texte changé (409)', async () => {
    editorMocks.state.scenes = [scene()];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 409 })),
    );

    await expect(
      regenerateSpeechAudio(1, { id: 'missing-1', text: 'Première ligne' }),
    ).resolves.toBeNull();
    expect(editorMocks.updateScene).not.toHaveBeenCalled();
  });

  it('le préchargement ne remplace que les lignes synthétisées dans les actions actuelles', async () => {
    const initial = scene();
    editorMocks.state.scenes = [initial];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { actionId: string; text: string };
        // Pendant la synthèse, une autre ligne est corrigée dans l'éditeur.
        editorMocks.state.scenes = [
          {
            ...initial,
            actions: (initial.actions ?? []).map((action) =>
              action.id === 'valid-id' ? { ...action, text: 'Corrigée' } : action,
            ),
          } as Scene,
        ];
        return new Response(
          JSON.stringify({
            success: true,
            actions: [
              { id: body.actionId, type: 'speech', text: body.text, audioUrl: `/${body.actionId}` },
              { id: 'valid-id', type: 'speech', text: 'Déjà valide', audioId: 'audio-1' },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await preflightMissingSpeechAudio(initial);

    expect(result?.map((action) => action.id)).toEqual([
      'missing-1',
      'valid-id',
      'empty',
      'missing-2',
      'valid-url',
    ]);
    expect(result?.find((action) => action.id === 'valid-id')).toMatchObject({
      text: 'Corrigée',
    });
    expect(result?.find((action) => action.id === 'missing-2')).toMatchObject({
      audioUrl: '/missing-2',
    });
  });

  it('« toutes les voix » relit chaque ligne au moment de l’envoyer et saute celles supprimées', async () => {
    const lines = (bText: string, withC: boolean): Scene =>
      ({
        ...scene(),
        actions: [
          { id: 'A', type: 'speech', text: 'a1' },
          { id: 'B', type: 'speech', text: bText },
          ...(withC ? [{ id: 'C', type: 'speech', text: 'c1' }] : []),
        ],
      }) as unknown as Scene;
    editorMocks.state.scenes = [lines('b1', true)];
    const sent: Array<{ actionId: string; text: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { actionId: string; text: string };
        sent.push({ actionId: body.actionId, text: body.text });
        // Pendant la synthèse de A, l'auteur corrige B et supprime C.
        if (body.actionId === 'A') editorMocks.state.scenes = [lines('b2', false)];
        return new Response(
          JSON.stringify({
            success: true,
            actions: [{ id: body.actionId, type: 'speech', text: body.text, audioUrl: '/x' }],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await regenerateAllSceneSpeech('scene-1');

    expect(sent).toEqual([
      { actionId: 'A', text: 'a1' },
      { actionId: 'B', text: 'b2' },
    ]);
    expect(result).toEqual({ okIds: ['A', 'B'], failed: 0 });
  });
});

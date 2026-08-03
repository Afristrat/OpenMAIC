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

vi.mock('@/lib/utils/database', () => ({ db: { audioFiles: {} } }));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: { getState: () => settings },
}));
vi.mock('@/lib/store/stage', () => ({
  useStageStore: { getState: () => ({ stage: { id: 'classroom-1' } }) },
}));

import {
  isManagedTtsActive,
  missingSpeechAudioActions,
  preflightMissingSpeechAudio,
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
    vi.unstubAllGlobals();
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
    expect(result).toEqual(finalActions);
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
});

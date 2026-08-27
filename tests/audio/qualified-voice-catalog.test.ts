import { describe, expect, it } from 'vitest';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import {
  getQualifiedVoicesForLanguage,
  HIGGS_QUALIFIED_VOICE_CATALOG,
} from '@/lib/audio/qualified-voice-catalog';
import { resolveAgentVoice, type ProviderWithVoices } from '@/lib/audio/voice-resolver';
import type { AgentConfig } from '@/lib/orchestration/registry/types';

describe('qualified Higgs voice catalog', () => {
  it('contains exactly ten stable profiles qualified for both French and English', () => {
    expect(HIGGS_QUALIFIED_VOICE_CATALOG).toHaveLength(10);
    expect(getQualifiedVoicesForLanguage('fr-FR')).toHaveLength(10);
    expect(getQualifiedVoicesForLanguage('en-US')).toHaveLength(10);
    expect(new Set(HIGGS_QUALIFIED_VOICE_CATALOG.map((voice) => voice.id)).size).toBe(10);
  });

  it('declares provider, gender, preview text and the live registry identity for every profile', () => {
    const registeredIds = new Set(TTS_PROVIDERS['higgs-tts'].voices.map((voice) => voice.id));
    for (const voice of HIGGS_QUALIFIED_VOICE_CATALOG) {
      expect(voice.providerId).toBe('higgs-tts');
      expect(['female', 'male']).toContain(voice.gender);
      expect(voice.previewTextByLanguage['fr-FR']).toContain(voice.name);
      expect(voice.previewTextByLanguage['en-US']).toContain(voice.name);
      expect(registeredIds.has(voice.id)).toBe(true);
    }
  });

  it('keeps the same identity selectable for French and English locale resolution', () => {
    const provider: ProviderWithVoices = {
      providerId: 'higgs-tts',
      providerName: 'Higgs Audio (Dīwān)',
      voices: HIGGS_QUALIFIED_VOICE_CATALOG,
      modelGroups: [],
    };
    const agent = { id: 'teacher' } as AgentConfig;

    expect(resolveAgentVoice(agent, 0, [provider], undefined, 'fr-FR')?.voiceId).toBe('hanae');
    expect(resolveAgentVoice(agent, 0, [provider], undefined, 'en-US')?.voiceId).toBe('hanae');
  });

  it('rejects a stale override whose declared gender conflicts with the agent identity', () => {
    const provider: ProviderWithVoices = {
      providerId: 'higgs-tts',
      providerName: 'Higgs Audio (Dīwān)',
      voices: HIGGS_QUALIFIED_VOICE_CATALOG,
      modelGroups: [],
    };
    const agent = { id: 'teacher', gender: 'female' } as AgentConfig;

    expect(
      resolveAgentVoice(agent, 0, [provider], {
        teacher: { providerId: 'higgs-tts', voiceId: 'mehdi' },
      })?.voiceId,
    ).toBe('hanae');
  });
});

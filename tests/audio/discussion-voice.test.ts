/**
 * Voix de la discussion en direct : chaque agent parle avec la voix chargée
 * avec SA formation (voiceConfig), jamais avec la voix globale du navigateur ;
 * les choix de la page de création, déjà inscrits dans la formation, ne sont
 * pas relus (ils déborderaient sur toutes les formations).
 */
import { describe, it, expect } from 'vitest';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { resolveDiscussionVoice, type ProviderWithVoices } from '@/lib/audio/voice-resolver';

const higgs: ProviderWithVoices = {
  providerId: 'higgs-tts',
  providerName: 'Higgs Audio (Dīwān)',
  voices: [
    { id: 'hanae', name: 'Hanae', gender: 'female' },
    { id: 'younes', name: 'Younes', gender: 'male' },
    { id: 'rim', name: 'Rim', gender: 'female' },
  ],
  modelGroups: [],
};

const teacher = (voiceConfig?: AgentConfig['voiceConfig']) =>
  ({
    id: 'persona-professor',
    name: 'Hanae',
    role: 'teacher',
    gender: 'female',
    voiceConfig,
  }) as AgentConfig;

const coach = (voiceConfig?: AgentConfig['voiceConfig']) =>
  ({ id: 'persona-coach', name: 'Rim', role: 'student', voiceConfig }) as AgentConfig;

const globalYounes = { providerId: 'higgs-tts' as const, voiceId: 'younes', modelId: 'higgs' };

describe('resolveDiscussionVoice', () => {
  it('le formateur Hanae parle avec sa voix de formation, pas avec la voix globale Younes', () => {
    const resolved = resolveDiscussionVoice({
      agent: teacher({ providerId: 'higgs-tts', voiceId: 'hanae' }),
      agentIndex: 0,
      providers: [higgs],
      globalVoice: globalYounes,
    });
    expect(resolved?.voiceId).toBe('hanae');
    expect(resolved?.providerId).toBe('higgs-tts');
  });

  it('la voix globale ne sert au formateur qu’en repli, sans voiceConfig', () => {
    const resolved = resolveDiscussionVoice({
      agent: teacher(),
      agentIndex: 0,
      providers: [higgs],
      globalVoice: globalYounes,
    });
    expect(resolved).toEqual(globalYounes);
  });

  it('la voix globale sert de repli quand le fournisseur de la formation est désactivé', () => {
    const resolved = resolveDiscussionVoice({
      agent: teacher({ providerId: 'openai-tts', voiceId: 'alloy' }),
      agentIndex: 0,
      providers: [higgs],
      globalVoice: globalYounes,
    });
    expect(resolved).toEqual(globalYounes);
  });

  it('un élève parle avec sa voix de formation', () => {
    const resolved = resolveDiscussionVoice({
      agent: coach({ providerId: 'higgs-tts', voiceId: 'rim' }),
      agentIndex: 1,
      providers: [higgs],
      globalVoice: globalYounes,
    });
    expect(resolved?.voiceId).toBe('rim');
  });
});

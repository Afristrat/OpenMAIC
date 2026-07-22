import { describe, it, expect } from 'vitest';
import { splitSpeechActionsByAnglicisms } from '@/lib/audio/tts-utils';
import type { SpeechAction } from '@/lib/types/action';

describe('splitSpeechActionsByAnglicisms', () => {
  it('splits a higgs-tts speech action containing an anglicism into fr/en sub-actions', () => {
    const action: SpeechAction = {
      id: 'action_3',
      type: 'speech',
      text: 'Nous allons configurer LiteLLM pour la production.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 'action_3_lang_1',
      text: 'Nous allons configurer',
      ttsLanguageOverride: 'fr',
    });
    expect(result[1]).toMatchObject({
      id: 'action_3_lang_2',
      text: 'LiteLLM',
      ttsLanguageOverride: 'en',
    });
    expect(result[2]).toMatchObject({
      id: 'action_3_lang_3',
      text: 'pour la production.',
      ttsLanguageOverride: 'fr',
    });
  });

  it('leaves actions untouched for providers other than higgs-tts', () => {
    const action: SpeechAction = {
      id: 'action_1',
      type: 'speech',
      text: 'Nous allons configurer LiteLLM pour la production.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'openai-tts');
    expect(result).toEqual([action]);
  });

  it('leaves a pure-French speech action as a single action', () => {
    const action: SpeechAction = {
      id: 'action_2',
      type: 'speech',
      text: 'Nous allons gérer notre budget.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toEqual([action]);
  });

  it('keeps sentence punctuation on a spoken segment instead of synthesizing punctuation alone', () => {
    const action: SpeechAction = {
      id: 'action_4',
      type: 'speech',
      text: 'Le budget est routé par LiteLLM.',
    };

    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ text: 'LiteLLM.', ttsLanguageOverride: 'en' });
    expect(result.every((item) => item.type !== 'speech' || /[\p{L}\p{N}]/u.test(item.text))).toBe(
      true,
    );
  });

  it('leaves non-speech actions untouched', () => {
    const action = { id: 'a1', type: 'spotlight' as const, elementId: 'el1' };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toEqual([action]);
  });
});

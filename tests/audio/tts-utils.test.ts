import { describe, it, expect } from 'vitest';
import {
  prepareTextForTTS,
  resolveSpeechLanguage,
  splitSpeechActionsByAnglicisms,
} from '@/lib/audio/tts-utils';
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

describe('French dirham speech preparation', () => {
  it('removes only the written plural s from the provider copy', () => {
    const displayed = '1 dirham, 2 dirhams et 12 500 Dirhams.';

    expect(prepareTextForTTS(displayed, 'fr-FR')).toBe('1 dirham, 2 dirham et 12 500 Dirham.');
    expect(displayed).toBe('1 dirham, 2 dirhams et 12 500 Dirhams.');
  });

  it('does not alter English, Arabic, ISO codes, neighbouring sigles or amounts', () => {
    const text = 'MAD, MADA, madame, 75 dirhamsX, 75 dirhams et 40 USD.';

    expect(prepareTextForTTS(text, 'en-US')).toBe(text);
    expect(prepareTextForTTS(text, 'ar-MA')).toBe(text);
    expect(prepareTextForTTS(text, 'français')).toBe(
      'MAD, MADA, madame, 75 dirhamsX, 75 dirham et 40 USD.',
    );
  });

  it('recognizes locale codes and generated language directives', () => {
    expect(resolveSpeechLanguage('Use French for all narration.')).toBe('fr');
    expect(resolveSpeechLanguage('fr-FR')).toBe('fr');
    expect(resolveSpeechLanguage('Teach in English.')).toBe('en');
    expect(resolveSpeechLanguage('العربية')).toBeUndefined();
  });
});

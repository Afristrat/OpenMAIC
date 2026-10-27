import { describe, expect, it } from 'vitest';
import { voiceCompletionErrorKey } from '@/lib/audio/complete-missing-voices';

describe('voiceCompletionErrorKey', () => {
  it.each([
    ['INSUFFICIENT_CREDITS', 'billing.credits.consumptionBlocked'],
    ['NO_CASTING', 'edit.tts.noCasting'],
    ['INVALID_CASTING', 'edit.tts.invalidCasting'],
    ['NOT_FOUND', 'edit.tts.notFound'],
    ['VOICE_COMPLETION_FAILED', 'edit.tts.completionFailed'],
    ['', 'edit.tts.completionFailed'],
    ['Failed to fetch', 'edit.tts.completionFailed'],
  ])('le code %s se traduit par la clé %s', (code, key) => {
    expect(voiceCompletionErrorKey(code)).toBe(key);
  });
});

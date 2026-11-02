import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeMissingVoices,
  voiceCompletionErrorKey,
} from '@/lib/audio/complete-missing-voices';

describe('voiceCompletionErrorKey', () => {
  it.each([
    ['INSUFFICIENT_CREDITS', 'billing.credits.consumptionBlocked'],
    ['NO_CASTING', 'edit.tts.noCasting'],
    ['INVALID_CASTING', 'edit.tts.invalidCasting'],
    ['NOT_FOUND', 'edit.tts.notFound'],
    ['FORBIDDEN', 'edit.tts.forbidden'],
    ['VOICE_COMPLETION_FAILED', 'edit.tts.completionFailed'],
    ['', 'edit.tts.completionFailed'],
    ['Failed to fetch', 'edit.tts.completionFailed'],
  ])('le code %s se traduit par la clé %s', (code, key) => {
    expect(voiceCompletionErrorKey(code)).toBe(key);
  });
});

describe('completeMissingVoices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('transmet le refus de droits (403) sous le code FORBIDDEN, pas sous un message générique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Classroom editor access required', code: 'FORBIDDEN' }),
          {
            status: 403,
          },
        ),
      ),
    );
    const silent = { id: 'a1', type: 'speech', text: 'Bonjour' };
    const scenes = [{ id: 's1', actions: [silent] }] as unknown as Parameters<
      typeof completeMissingVoices
    >[1];
    await expect(completeMissingVoices('lDQ_9JQNLu', scenes)).rejects.toThrow('FORBIDDEN');
  });
});

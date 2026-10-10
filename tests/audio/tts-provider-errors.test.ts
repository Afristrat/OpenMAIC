import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import { isRetryableGenerationError } from '@/lib/generation/generation-retry';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

const config = {
  providerId: 'openai-tts' as const,
  modelId: 'tts-1',
  apiKey: 'test-key',
  baseUrl: 'http://tts.test/v1',
  voice: 'alloy',
};

describe('erreurs HTTP des fournisseurs de voix', () => {
  it('conserve le code HTTP d’un 500 pour qu’il soit rejoué', async () => {
    stubFetch(500, 'Internal Server Error');
    const error = await generateTTS(config, 'Bonjour').catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('OpenAI TTS API error: Internal Server Error');
    expect(error.status).toBe(500);
    expect(isRetryableGenerationError(error)).toBe(true);
  });

  it('ne fait pas rejouer une requête invalide', async () => {
    stubFetch(400, 'invalid voice');
    const error = await generateTTS(config, 'Bonjour').catch((caught) => caught);

    expect(error.status).toBe(400);
    expect(isRetryableGenerationError(error)).toBe(false);
  });
});

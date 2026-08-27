import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { transcribeAudio } from '@/lib/audio/asr-providers';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function wavBuffer(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(8, 4);
  buffer.write('WAVE', 8, 'ascii');
  return buffer;
}

describe('OpenAI-compatible Whisper ASR', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            duration: 1,
            language: 'fr',
            segments: [
              {
                id: 0,
                seek: null,
                start: 0,
                end: 1,
                text: 'Bonjour',
                tokens: [],
                temperature: null,
                avg_logprob: null,
                compression_ratio: null,
                no_speech_prob: null,
              },
            ],
            text: 'Bonjour',
            usage: null,
            words: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  });

  it('accepts a successful LocalAI response containing nullable metadata', async () => {
    const result = await transcribeAudio(
      {
        providerId: 'openai-whisper',
        apiKey: 'test-key',
        baseUrl: 'https://proxy.example.com/v1/',
        modelId: 'whisper-1',
        language: 'fr',
      },
      wavBuffer(),
    );

    expect(result).toEqual({ text: 'Bonjour' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://proxy.example.com/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );

    const formData = mockFetch.mock.calls[0][1].body as FormData;
    expect(formData.get('model')).toBe('whisper-1');
    expect(formData.get('language')).toBe('fr');
    expect(formData.get('response_format')).toBe('json');
    expect(formData.get('file')).toBeInstanceOf(Blob);
  });

  it.each([
    ['fr-FR', 'fr'],
    ['ar-MA', 'ar'],
    ['en-US', 'en'],
  ])('sends locale %s as Whisper language %s', async (locale, expectedLanguage) => {
    await transcribeAudio(
      {
        providerId: 'openai-whisper',
        apiKey: 'test-key',
        baseUrl: 'https://proxy.example.com/v1',
        modelId: 'whisper-1',
        language: locale,
      },
      wavBuffer(),
    );

    const formData = mockFetch.mock.calls[0][1].body as FormData;
    expect(formData.get('language')).toBe(expectedLanguage);
  });
});

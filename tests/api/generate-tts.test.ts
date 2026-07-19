import { describe, it, expect, vi } from 'vitest';

const generateTTSMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/audio/tts-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
  generateTTS: generateTTSMock,
}));

import { POST } from '@/app/api/generate/tts/route';

describe('POST /api/generate/tts — ttsLanguageOverride passthrough', () => {
  it('forwards ttsLanguageOverride into the TTSModelConfig passed to generateTTS', async () => {
    generateTTSMock.mockResolvedValue({ audio: new Uint8Array([1]), format: 'wav' });

    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'LiteLLM',
        audioId: 'a1',
        ttsProviderId: 'higgs-tts',
        ttsVoice: 'default',
        ttsLanguageOverride: 'en',
      }),
    });
    await POST(req as unknown as Parameters<typeof POST>[0]);

    const [config] = generateTTSMock.mock.calls[0];
    expect(config.language).toBe('en');
  });
});

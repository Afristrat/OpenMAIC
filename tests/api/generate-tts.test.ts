import { beforeEach, describe, it, expect, vi } from 'vitest';

const generateTTSMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/audio/tts-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
  generateTTS: generateTTSMock,
}));

import { POST } from '@/app/api/generate/tts/route';

describe('POST /api/generate/tts — ttsLanguageOverride passthrough', () => {
  beforeEach(() => generateTTSMock.mockReset());

  it.each([
    [{ ttsLanguageOverride: 'zh' }, 'higgs-tts'],
    [{ ttsLanguageOverride: 'en' }, 'openai-tts'],
  ])('rejects an unsupported language override before synthesis', async (extra, providerId) => {
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'LiteLLM',
        audioId: 'a1',
        ttsProviderId: providerId,
        ttsVoice: 'default',
        ...extra,
      }),
    });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    expect(generateTTSMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before synthesis', async () => {
    const req = new Request('http://localhost/api/generate/tts', { method: 'POST', body: '{' });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    expect(generateTTSMock).not.toHaveBeenCalled();
  });

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

  it('forwards the classroom language independently of provider-specific overrides', async () => {
    generateTTSMock.mockResolvedValue({ audio: new Uint8Array([1]), format: 'wav' });
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Un budget de 250 dirhams.',
        audioId: 'a2',
        ttsProviderId: 'openai-tts',
        ttsVoice: 'alloy',
        ttsLanguage: 'fr',
      }),
    });

    await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(generateTTSMock.mock.calls[0]?.[0]?.language).toBe('fr');
  });
});

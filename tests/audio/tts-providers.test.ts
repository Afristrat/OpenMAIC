import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig } from '@/lib/audio/types';

describe('generateTTS — higgs-tts language passthrough', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes language in the request body when config.language is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ 'content-type': 'audio/wav' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config: TTSModelConfig = {
      providerId: 'higgs-tts',
      voice: 'default',
      baseUrl: 'http://192.168.100.7:7861',
      language: 'en',
    };
    await generateTTS(config, 'LiteLLM');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.language).toBe('en');
  });

  it('omits language from the request body when config.language is undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ 'content-type': 'audio/wav' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config: TTSModelConfig = {
      providerId: 'higgs-tts',
      voice: 'default',
      baseUrl: 'http://192.168.100.7:7861',
    };
    await generateTTS(config, 'Nous allons gérer notre budget.');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.language).toBeUndefined();
  });
});

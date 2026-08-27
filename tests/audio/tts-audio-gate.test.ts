import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import { NoiseFloorError, TachkilRequiredError } from '@/lib/audio/audio-gate';
import type { TTSModelConfig } from '@/lib/audio/types';
import { buildPcm16Wav } from './pcm16-wav-fixture';

afterEach(() => vi.unstubAllGlobals());

function stubWavResponse(samples: number[]) {
  const bytes = buildPcm16Wav(samples);
  const f = vi.fn(
    async () =>
      new Response(new Blob([bytes]), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      }),
  );
  vi.stubGlobal('fetch', f);
  return f;
}

describe('generateTTS — audio gate wiring (S1-009)', () => {
  it('rejects undiacritized Arabic text on a non-tachkil-aware provider without calling the network', async () => {
    const f = stubWavResponse([16000, -16000]);
    const config: TTSModelConfig = {
      providerId: 'azure-tts',
      apiKey: 'test-key',
      voice: 'ar-MA-MounaNeural',
    };

    await expect(generateTTS(config, 'السلام عليكم')).rejects.toThrow(TachkilRequiredError);
    expect(f).not.toHaveBeenCalled();
  });

  it('allows undiacritized Arabic text on the tachkil-aware VoxCPM provider', async () => {
    stubWavResponse([16000, -16000, 12000]);
    const config: TTSModelConfig = {
      providerId: 'voxcpm-tts',
      voice: 'default',
      baseUrl: 'https://voxcpm.test/v1',
    };

    const result = await generateTTS(config, 'السلام عليكم');
    expect(result.format).toBe('wav');
  });

  it('rejects a near-silent WAV track (below the -50 dB noise floor) even for non-Arabic text', async () => {
    stubWavResponse([50, -50, 30]); // ≈ -56 dB peak
    const config: TTSModelConfig = {
      providerId: 'voxcpm-tts',
      voice: 'default',
      baseUrl: 'https://voxcpm.test/v1',
    };

    await expect(generateTTS(config, 'Bonjour tout le monde')).rejects.toThrow(NoiseFloorError);
  });

  it('accepts a normal-level WAV track', async () => {
    stubWavResponse([16000, -16000, 18000]);
    const config: TTSModelConfig = {
      providerId: 'voxcpm-tts',
      voice: 'default',
      baseUrl: 'https://voxcpm.test/v1',
    };

    const result = await generateTTS(config, 'Bonjour tout le monde');
    expect(result.audio.length).toBeGreaterThan(0);
  });

  it('passes through already-diacritized Arabic text on a non-tachkil-aware provider', async () => {
    stubWavResponse([16000, -16000]);
    const config: TTSModelConfig = {
      providerId: 'glm-tts',
      apiKey: 'test-key',
      voice: 'tongtong',
    };

    await expect(generateTTS(config, 'السَّلَامُ عَلَيْكُمْ')).resolves.toBeDefined();
  });
});

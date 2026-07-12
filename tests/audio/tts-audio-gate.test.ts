import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import { NoiseFloorError, TachkilRequiredError } from '@/lib/audio/audio-gate';
import type { TTSModelConfig } from '@/lib/audio/types';

afterEach(() => vi.unstubAllGlobals());

/** Builds a minimal valid mono 16-bit PCM WAV buffer from Int16 samples. */
function buildWav(samples: number[], sampleRate = 24000): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  samples.forEach((sample, i) => view.setInt16(44 + i * bytesPerSample, sample, true));

  return new Uint8Array(buffer);
}

function stubWavResponse(samples: number[]) {
  const bytes = buildWav(samples);
  const f = vi.fn(
    async () =>
      new Response(bytes, {
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

  it('passes through already-diacritized Arabic text on any provider', async () => {
    stubWavResponse([16000, -16000]);
    const config: TTSModelConfig = {
      providerId: 'azure-tts',
      apiKey: 'test-key',
      voice: 'ar-MA-MounaNeural',
    };

    await expect(generateTTS(config, 'السَّلَامُ عَلَيْكُمْ')).resolves.toBeDefined();
  });
});

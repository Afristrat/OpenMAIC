import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  AudioGateFormatError,
  assertAboveNoiseFloor,
  assertArabicTachkilReady,
  computeWavPeakDbfs,
  containsArabicScript,
  hasArabicTashkeel,
  NOISE_FLOOR_DBFS,
  NoiseFloorError,
  TachkilRequiredError,
} from '@/lib/audio/audio-gate';
import { buildPcm16Wav } from './pcm16-wav-fixture';

function buildMp3(samples: number[], sampleRate = 24000): Uint8Array {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  const result = spawnSync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      's16le',
      '-ar',
      String(sampleRate),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-f',
      'mp3',
      'pipe:1',
    ],
    { input: pcm },
  );
  if (result.status !== 0) {
    throw new Error(`Fixture MP3 impossible à générer : ${result.stderr.toString('utf8')}`);
  }
  return new Uint8Array(result.stdout);
}

function sineSamples(amplitude: number, sampleRate = 24000): number[] {
  return Array.from({ length: sampleRate / 2 }, (_, index) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 440 * index) / sampleRate)),
  );
}

describe('containsArabicScript / hasArabicTashkeel', () => {
  it('detects Arabic script text', () => {
    expect(containsArabicScript('السلام عليكم')).toBe(true);
    expect(containsArabicScript('Bonjour tout le monde')).toBe(false);
    expect(containsArabicScript('')).toBe(false);
  });

  it('detects presence of tashkeel diacritics', () => {
    expect(hasArabicTashkeel('السَّلَامُ عَلَيْكُمْ')).toBe(true);
    expect(hasArabicTashkeel('السلام عليكم')).toBe(false);
  });
});

describe('assertArabicTachkilReady', () => {
  it('throws TachkilRequiredError for undiacritized Arabic text on a non-tachkil-aware provider', () => {
    expect(() => assertArabicTachkilReady('السلام عليكم', 'azure-tts')).toThrow(
      TachkilRequiredError,
    );
  });

  it('allows undiacritized Arabic text on the tachkil-aware VoxCPM provider', () => {
    expect(() => assertArabicTachkilReady('السلام عليكم', 'voxcpm-tts')).not.toThrow();
  });

  it('allows already-diacritized Arabic text on any provider', () => {
    expect(() => assertArabicTachkilReady('السَّلَامُ عَلَيْكُمْ', 'azure-tts')).not.toThrow();
  });

  it('is a no-op for non-Arabic text regardless of provider', () => {
    expect(() => assertArabicTachkilReady('Bonjour tout le monde', 'azure-tts')).not.toThrow();
    expect(() => assertArabicTachkilReady('', 'azure-tts')).not.toThrow();
  });
});

describe('computeWavPeakDbfs', () => {
  it('computes peak dBFS for a normal-level WAV', () => {
    const wav = buildPcm16Wav([16000, -16000, 8000, -4000]);
    const dbfs = computeWavPeakDbfs(wav);
    expect(dbfs).not.toBeNull();
    expect(dbfs as number).toBeCloseTo(20 * Math.log10(16000 / 32768), 1);
  });

  it('returns -Infinity for total silence', () => {
    const wav = buildPcm16Wav([0, 0, 0, 0]);
    expect(computeWavPeakDbfs(wav)).toBe(-Infinity);
  });

  it('returns null for a non-WAV/malformed buffer (e.g. tiny RIFF stub used by other TTS provider tests)', () => {
    const stub = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // 'RIFF' only, no WAVE/fmt/data
    expect(computeWavPeakDbfs(stub)).toBeNull();
  });
});

describe('assertAboveNoiseFloor', () => {
  it('passes for a WAV clearly above the -50 dB noise floor', async () => {
    const wav = buildPcm16Wav([16000, -16000, 12000, -12000]);
    await expect(assertAboveNoiseFloor(wav, 'wav')).resolves.toBeUndefined();
  });

  it('rejects a noisy/near-silent WAV below the -50 dB noise floor', async () => {
    // amplitude 50 → 20*log10(50/32768) ≈ -56.3 dB, below the -50 dB floor
    const wav = buildPcm16Wav([50, -50, 30, -30]);
    await expect(assertAboveNoiseFloor(wav, 'wav')).rejects.toThrow(NoiseFloorError);
  });

  it('rejects total silence', async () => {
    const wav = buildPcm16Wav([0, 0, 0, 0]);
    await expect(assertAboveNoiseFloor(wav, 'wav')).rejects.toThrow(NoiseFloorError);
  });

  it('checks a normal-level MP3 fixture', async () => {
    const mp3 = buildMp3(sineSamples(12000));
    await expect(assertAboveNoiseFloor(mp3, 'mp3')).resolves.toBeUndefined();
  });

  it('rejects a near-silent MP3 fixture below -50 dB', async () => {
    const mp3 = buildMp3(sineSamples(30));
    await expect(assertAboveNoiseFloor(mp3, 'mp3')).rejects.toThrow(NoiseFloorError);
  });

  it('rejects an unsupported format instead of bypassing the gate', async () => {
    await expect(assertAboveNoiseFloor(new Uint8Array(100), 'opus')).rejects.toThrow(
      AudioGateFormatError,
    );
  });

  it('exposes the -50 dB threshold as a named constant', () => {
    expect(NOISE_FLOOR_DBFS).toBe(-50);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assertAboveNoiseFloor,
  assertArabicTachkilReady,
  computeWavPeakDbfs,
  containsArabicScript,
  hasArabicTashkeel,
  NOISE_FLOOR_DBFS,
  NoiseFloorError,
  TachkilRequiredError,
} from '@/lib/audio/audio-gate';

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
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // NumChannels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // ByteRate
  view.setUint16(32, bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  samples.forEach((sample, i) => view.setInt16(44 + i * bytesPerSample, sample, true));

  return new Uint8Array(buffer);
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
    const wav = buildWav([16000, -16000, 8000, -4000]);
    const dbfs = computeWavPeakDbfs(wav);
    expect(dbfs).not.toBeNull();
    expect(dbfs as number).toBeCloseTo(20 * Math.log10(16000 / 32768), 1);
  });

  it('returns -Infinity for total silence', () => {
    const wav = buildWav([0, 0, 0, 0]);
    expect(computeWavPeakDbfs(wav)).toBe(-Infinity);
  });

  it('returns null for a non-WAV/malformed buffer (e.g. tiny RIFF stub used by other TTS provider tests)', () => {
    const stub = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // 'RIFF' only, no WAVE/fmt/data
    expect(computeWavPeakDbfs(stub)).toBeNull();
  });
});

describe('assertAboveNoiseFloor', () => {
  it('passes for a WAV clearly above the -50 dB noise floor', () => {
    const wav = buildWav([16000, -16000, 12000, -12000]);
    expect(() => assertAboveNoiseFloor(wav, 'wav')).not.toThrow();
  });

  it('rejects a noisy/near-silent WAV below the -50 dB noise floor', () => {
    // amplitude 50 → 20*log10(50/32768) ≈ -56.3 dB, below the -50 dB floor
    const wav = buildWav([50, -50, 30, -30]);
    expect(() => assertAboveNoiseFloor(wav, 'wav')).toThrow(NoiseFloorError);
  });

  it('rejects total silence', () => {
    const wav = buildWav([0, 0, 0, 0]);
    expect(() => assertAboveNoiseFloor(wav, 'wav')).toThrow(NoiseFloorError);
  });

  it('does not check non-WAV formats (documented decoder limitation)', () => {
    const quietBytes = new Uint8Array(100); // all-zero bytes, would fail a WAV check
    expect(() => assertAboveNoiseFloor(quietBytes, 'mp3')).not.toThrow();
  });

  it('exposes the -50 dB threshold as a named constant', () => {
    expect(NOISE_FLOOR_DBFS).toBe(-50);
  });
});

import { describe, expect, it } from 'vitest';
import { measureAudioDurationSeconds } from '@/lib/audio/duration';
import { buildPcm16Wav } from './pcm16-wav-fixture';

describe('measureAudioDurationSeconds', () => {
  it('accepts a large valid WAV when ffprobe closes its input after reading metadata', async () => {
    const wav = buildPcm16Wav(new Array(500_000).fill(12000));
    await expect(measureAudioDurationSeconds(wav)).resolves.toBeCloseTo(500_000 / 24_000, 3);
  });

  it('rejects a large malformed stream without an unhandled broken pipe', async () => {
    const malformed = new Uint8Array(16 * 1024 * 1024);
    await expect(measureAudioDurationSeconds(malformed)).rejects.toThrow(
      /Audio duration probe (input )?failed/,
    );
  });
});

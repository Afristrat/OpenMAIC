import { describe, expect, it } from 'vitest';
import { measureAudioDurationSeconds } from '@/lib/audio/duration';
import { buildPcm16Wav } from './pcm16-wav-fixture';

describe('measureAudioDurationSeconds', () => {
  it('measures a large valid WAV without depending on an ffprobe pipe', async () => {
    const wav = buildPcm16Wav(new Array(500_000).fill(12000));
    const previousPath = process.env.FFPROBE_PATH;
    process.env.FFPROBE_PATH = '/binary-that-must-not-be-called-for-wav';
    try {
      await expect(measureAudioDurationSeconds(wav)).resolves.toBeCloseTo(500_000 / 24_000, 3);
    } finally {
      if (previousPath === undefined) delete process.env.FFPROBE_PATH;
      else process.env.FFPROBE_PATH = previousPath;
    }
  });

  it('rejects a large malformed stream without an unhandled broken pipe', async () => {
    const malformed = new Uint8Array(16 * 1024 * 1024);
    await expect(measureAudioDurationSeconds(malformed)).rejects.toThrow(
      /Audio duration probe (input )?failed/,
    );
  });
});

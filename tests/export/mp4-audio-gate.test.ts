import { describe, expect, it } from 'vitest';
import {
  assertExportAudioAboveNoiseFloor,
  audioFormatFromStoragePath,
  storagePathFromAudioUrl,
} from '@/lib/export/mp4/build-classroom-video';
import { NoiseFloorError } from '@/lib/audio/audio-gate';
import { buildPcm16Wav } from '@/tests/audio/pcm16-wav-fixture';

describe('export MP4 — gate audio', () => {
  it('resolves a persistent audio path without leaking the cache-busting query', () => {
    expect(
      storagePathFromAudioUrl(
        'course-1',
        '/api/classroom-media/course-1/audio/teacher.wav?v=abc123',
      ),
    ).toBe('course-1/audio/teacher.wav');
    expect(audioFormatFromStoragePath('course-1/audio/teacher.mp3')).toBe('mp3');
  });

  it('rechecks stored narration and rejects a track below -50 dB before export', async () => {
    await expect(
      assertExportAudioAboveNoiseFloor(buildPcm16Wav([40, -40, 20, -20]), 'course/audio/quiet.wav'),
    ).rejects.toThrow(NoiseFloorError);
  });

  it('accepts a stored narration above the threshold', async () => {
    await expect(
      assertExportAudioAboveNoiseFloor(
        buildPcm16Wav([16000, -16000, 12000, -12000]),
        'course/audio/voice.wav',
      ),
    ).resolves.toBeUndefined();
  });
});

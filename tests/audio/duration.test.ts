import { describe, expect, it } from 'vitest';
import { measureAudioDurationSeconds } from '@/lib/audio/duration';

describe('measureAudioDurationSeconds', () => {
  it('rejects a large malformed stream without an unhandled broken pipe', async () => {
    const malformed = new Uint8Array(16 * 1024 * 1024);
    await expect(measureAudioDurationSeconds(malformed)).rejects.toThrow(
      /Audio duration probe (input )?failed/,
    );
  });
});

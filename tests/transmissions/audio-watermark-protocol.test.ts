import { describe, expect, it } from 'vitest';
import {
  audioWatermarkProtocol,
  decodeAudioWatermarkMessages,
  encodeAudioWatermarkMessages,
} from '@/lib/transmissions/audio-watermark-protocol';

const watermarkId = '0123456789abcdef0123456789abcdef';

describe('audio watermark protocol', () => {
  it('round-trips a 128-bit opaque identifier through eleven 16-bit messages', () => {
    const messages = encodeAudioWatermarkMessages(watermarkId);

    expect(messages).toHaveLength(11);
    expect(messages.every((message) => message >= 0 && message <= 0xffff)).toBe(true);
    expect(decodeAudioWatermarkMessages(messages)).toBe(watermarkId);
    expect(audioWatermarkProtocol.cycleDurationSeconds).toBe(22);
  });

  it('accepts agreeing repeats from consecutive cycles', () => {
    const messages = encodeAudioWatermarkMessages(watermarkId);

    expect(decodeAudioWatermarkMessages([...messages, ...messages])).toBe(watermarkId);
  });

  it('fails closed for a missing, conflicting or corrupted segment', () => {
    const messages = [...encodeAudioWatermarkMessages(watermarkId)];
    const corrupted = [...messages];
    corrupted[10] ^= 1;

    expect(decodeAudioWatermarkMessages(messages.slice(0, -1))).toBeNull();
    expect(decodeAudioWatermarkMessages([...messages, messages[0] ^ 1])).toBeNull();
    expect(decodeAudioWatermarkMessages(corrupted)).toBeNull();
  });

  it('rejects malformed identifiers and detector output outside sixteen bits', () => {
    expect(() => encodeAudioWatermarkMessages('not-a-watermark')).toThrow(/128 bits/i);
    expect(decodeAudioWatermarkMessages([0x1_0000])).toBeNull();
  });
});

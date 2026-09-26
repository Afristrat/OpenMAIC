import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWavBlob, normalizeASRUploadAudio } from '@/lib/audio/wav-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWavBlob', () => {
  it('detects audio/wav MIME type', () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'audio/wav' });
    expect(isWavBlob(blob)).toBe(true);
  });

  it('detects audio/x-wav MIME type', () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'audio/x-wav' });
    expect(isWavBlob(blob)).toBe(true);
  });

  it('detects .wav file extension when MIME is missing', () => {
    const blob = new Blob([new Uint8Array(4)]);
    expect(isWavBlob(blob, 'recording.wav')).toBe(true);
    expect(isWavBlob(blob, 'recording.WAV')).toBe(true);
  });

  it('returns false for non-WAV blobs without a wav filename', () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'audio/webm' });
    expect(isWavBlob(blob)).toBe(false);
    expect(isWavBlob(blob, 'recording.webm')).toBe(false);
  });
});

describe('normalizeASRUploadAudio', () => {
  it('passes through providers whose upstream accepts the browser recording format', async () => {
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
    const result = await normalizeASRUploadAudio('qwen-asr', input);
    expect(result.blob).toBe(input);
    expect(result.fileName).toBe('recording.webm');
  });

  it('keeps the filename consistent with the format recorded by the browser', async () => {
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' });
    const result = await normalizeASRUploadAudio('qwen-asr', input);
    expect(result.fileName).toBe('recording.m4a');
  });

  it('normalizes browser recordings to WAV for the managed Whisper-compatible upstream', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    class FakeAudioContext {
      decodeAudioData = vi.fn().mockResolvedValue({
        sampleRate: 16000,
        length: 2,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0.25, -0.25]),
      });

      close = close;
    }
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

    const result = await normalizeASRUploadAudio('openai-whisper', input);

    expect(result.blob).not.toBe(input);
    expect(result.blob.type).toBe('audio/wav');
    expect(result.fileName).toBe('recording.wav');
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps WAV blobs unchanged for lemonade-asr', async () => {
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const result = await normalizeASRUploadAudio('lemonade-asr', input);
    expect(result.blob).toBe(input);
    expect(result.fileName).toBe('recording.wav');
  });
});

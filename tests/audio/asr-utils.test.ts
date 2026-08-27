import { describe, expect, it } from 'vitest';
import {
  getASRAudioFileName,
  isSupportedASRAudioUpload,
  normalizeASRLanguage,
  resolveASRLanguageSelection,
  selectASRRecordingMimeType,
} from '@/lib/audio/asr-utils';

describe('ASR language normalization', () => {
  it.each([
    ['fr-FR', 'fr'],
    ['ar-MA', 'ar'],
    ['en_US', 'en'],
    ['auto', 'auto'],
    ['', 'auto'],
  ])('normalizes %s for a server ASR provider', (input, expected) => {
    expect(normalizeASRLanguage(input)).toBe(expected);
  });

  it('preserves the same language when switching between ISO and BCP-47 providers', () => {
    expect(resolveASRLanguageSelection('fr-FR', ['auto', 'fr', 'ar', 'en'])).toBe('fr');
    expect(resolveASRLanguageSelection('ar', ['fr-FR', 'ar-MA', 'en-US'])).toBe('ar-MA');
  });
});

describe('ASR recording and upload formats', () => {
  it('selects the first MIME type supported by the browser', () => {
    expect(selectASRRecordingMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(selectASRRecordingMimeType(() => false)).toBeUndefined();
  });

  it('derives a filename from the actual recording MIME type', () => {
    expect(getASRAudioFileName(new Blob(['audio'], { type: 'audio/mp4' }))).toBe('recording.m4a');
    expect(getASRAudioFileName(new Blob(['audio'], { type: 'audio/ogg;codecs=opus' }))).toBe(
      'recording.ogg',
    );
  });

  it('rejects a text upload while accepting audio MIME types and legacy audio extensions', () => {
    expect(
      isSupportedASRAudioUpload(new File(['audio'], 'clip.webm', { type: 'audio/webm' })),
    ).toBe(true);
    expect(isSupportedASRAudioUpload(new File(['audio'], 'clip.wav'))).toBe(true);
    expect(
      isSupportedASRAudioUpload(new File(['fake'], 'clip.wav', { type: 'audio/unknown' })),
    ).toBe(false);
    expect(
      isSupportedASRAudioUpload(new File(['not audio'], 'notes.txt', { type: 'text/plain' })),
    ).toBe(false);
  });
});

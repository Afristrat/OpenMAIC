import { describe, expect, test } from 'vitest';
import {
  isSilentSpeech,
  missingSpeechAudioMessage,
  summarizeSpeechAudio,
} from '@/lib/audio/speech-audio-report';
import type { Action } from '@/lib/types/action';

const speech = (id: string, text: string, audioUrl?: string): Action =>
  ({ id, type: 'speech', text, ...(audioUrl ? { audioUrl } : {}) }) as Action;

describe('speech audio report', () => {
  test('a line is silent only when it has a text and no audio file', () => {
    expect(isSilentSpeech(speech('a', 'Bonjour'))).toBe(true);
    expect(isSilentSpeech(speech('a', 'Bonjour', '/audio/a.mp3'))).toBe(false);
    expect(isSilentSpeech(speech('a', '   '))).toBe(false);
    expect(isSilentSpeech({ id: 'b', type: 'spotlight', elementId: 'e' } as Action)).toBe(false);
  });

  test('counts speech and silent lines per scene', () => {
    const report = summarizeSpeechAudio([
      { id: 's1', order: 1, actions: [speech('a', 'Un'), speech('b', 'Deux', '/x.mp3')] },
      { id: 's2', order: 2, actions: [speech('c', 'Trois', '/y.mp3')] },
      { id: 's3', order: 3 },
    ]);
    expect(report.speech).toBe(3);
    expect(report.missing).toBe(1);
    expect(report.scenes.map((scene) => scene.missing)).toEqual([1, 0, 0]);
  });

  test('the refusal names every scene concerned by its position and says how to fix it', () => {
    const report = summarizeSpeechAudio([
      { id: 's1', order: 1, actions: [speech('a', 'Un'), speech('b', 'Deux')] },
      { id: 's2', order: 2, actions: [speech('c', 'Trois', '/y.mp3')] },
      { id: 's3', order: 3, actions: [speech('d', 'Quatre')] },
    ]);
    const message = missingSpeechAudioMessage(report, 'MP4');
    expect(message).toContain('Export MP4 refusé : 3 prise(s) de parole sans voix');
    expect(message).toContain('scène(s) 1 (2), 3 (1)');
    expect(message).toContain('Générer les voix manquantes');
  });
});

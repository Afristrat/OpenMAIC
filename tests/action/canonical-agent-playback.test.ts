import { describe, expect, test, vi } from 'vitest';
import { PlaybackEngine } from '@/lib/playback/engine';

describe('canonical agent playback', () => {
  test('exposes the complete speech action when an attributed line starts', () => {
    const onSpeechStart = vi.fn();
    const action = {
      id: 'speech-1',
      type: 'speech',
      text: 'Quel fait invaliderait cette hypothèse ?',
      agentId: 'analyst',
      interventionId: 'scene-1-blind-spot',
      interventionForm: 'blind-spot',
      audioUrl: '/api/classroom-media/classroom-1/audio/speech-1.wav',
    } as const;
    const engine = new PlaybackEngine(
      [
        {
          id: 'scene-1',
          type: 'slide',
          title: 'Hypothèses',
          order: 1,
          content: {} as never,
          actions: [action],
        },
      ] as never,
      { execute: vi.fn(), clearEffects: vi.fn() } as never,
      {
        play: vi.fn().mockResolvedValue(true),
        onEnded: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        isPlaying: vi.fn().mockReturnValue(false),
        hasActiveAudio: vi.fn().mockReturnValue(false),
      } as never,
      { onSpeechStart },
    );

    engine.start();

    expect(onSpeechStart).toHaveBeenCalledWith(action.text, expect.objectContaining(action));
  });
});

import { describe, expect, it } from 'vitest';
import { buildSessionReplay, findReplayAudioAt } from '@/lib/playback/session-replay';

describe('session replay timeline', () => {
  it('orders adjacent bigint event IDs without numeric rounding', () => {
    const events = ['9007199254740993', '9007199254740992'].map((id) => ({
      id,
      tsMs: 0,
      actor: 'user' as const,
      eventType: 'text',
      payload: {},
      audioPath: null,
      audioBytes: 0,
    }));
    expect(buildSessionReplay(events).events.map((event) => event.id)).toEqual([
      '9007199254740992',
      '9007199254740993',
    ]);
  });
  it('orders concurrent events deterministically and reports persisted audio usage', () => {
    const replay = buildSessionReplay([
      {
        id: 3,
        tsMs: 900,
        actor: 'user',
        eventType: 'user_message',
        payload: { text: 'Et au Maroc ?' },
        audioPath: null,
        audioBytes: 0,
      },
      {
        id: 2,
        tsMs: 100,
        actor: 'agent',
        eventType: 'speech',
        payload: { text: 'Commençons.' },
        audioPath: '/api/classroom-media/course-42/audio/intro.wav',
        audioBytes: 1_048_576,
      },
      {
        id: 1,
        tsMs: 100,
        actor: 'system',
        eventType: 'scene_change',
        payload: { sceneId: 'scene-1' },
        audioPath: null,
        audioBytes: 0,
      },
    ]);

    expect(replay.events.map((event) => event.id)).toEqual([1, 2, 3]);
    expect(replay.durationMs).toBe(900);
    expect(replay.audioBytes).toBe(1_048_576);
    expect(replay.audioMegabytes).toBe(1);
    expect(findReplayAudioAt(replay.events, 99)).toBeNull();
    expect(findReplayAudioAt(replay.events, 100)?.id).toBe(2);
    expect(findReplayAudioAt(replay.events, 900)?.id).toBe(2);
  });
});

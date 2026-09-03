import { describe, expect, it } from 'vitest';
import {
  parseCreateLiveSession,
  parseLiveSessionEvent,
  parseReplayPosition,
} from '@/lib/live-session/contracts';

describe('live session contracts', () => {
  it('requires an explicit recording consent when starting a session', () => {
    expect(parseCreateLiveSession({ stageId: 'course-42', recorded: true })).toEqual({
      stageId: 'course-42',
      recorded: true,
    });
    expect(() => parseCreateLiveSession({ stageId: 'course-42', recorded: false })).toThrow(
      'Explicit recording consent is required',
    );
  });

  it('accepts replayable events from agents, the learner, and the system', () => {
    expect(
      parseLiveSessionEvent({
        tsMs: 1250,
        actor: 'user',
        eventType: 'user_message',
        payload: { text: 'Pouvez-vous donner un exemple ?' },
        audioPath: null,
        audioBytes: 0,
      }),
    ).toEqual({
      tsMs: 1250,
      actor: 'user',
      eventType: 'user_message',
      payload: { text: 'Pouvez-vous donner un exemple ?' },
      audioPath: null,
      audioBytes: 0,
    });
  });

  it('rejects malformed event boundaries and negative replay positions', () => {
    expect(() =>
      parseLiveSessionEvent({
        tsMs: -1,
        actor: 'visitor',
        eventType: '',
        payload: [],
      }),
    ).toThrow();
    expect(() => parseReplayPosition({ positionMs: -1 })).toThrow();
    expect(parseReplayPosition({ positionMs: 3210 })).toEqual({ positionMs: 3210 });
  });
});

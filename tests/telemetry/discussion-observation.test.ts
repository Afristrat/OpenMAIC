import { describe, expect, it } from 'vitest';
import {
  DiscussionObservationBuffer,
  classifyIntervention,
  discussionObservationSchema,
} from '@/lib/telemetry/discussion-observation';
const id = '00000000-0047-4000-8000-000000000001';

describe('bounded discussion observations', () => {
  it('records real order, elapsed milliseconds and first post-discussion score without text', () => {
    let time = 0;
    const buffer = new DiscussionObservationBuffer(id, 'scene-1', () => time);
    expect(buffer.recordQuiz('quiz', 1)).toBe(false);
    buffer.startTurn('turn1', 'agent-a');
    time = 1500;
    buffer.finishTurn('turn1', 'Par exemple, ce contenu doit rester privé.', 'completed');
    buffer.startTurn('turn2', 'agent-b');
    time = 2300;
    buffer.finishTurn('turn2', 'كيف نبدأ؟', 'completed');
    buffer.end();
    expect(buffer.recordQuiz('quiz', 0)).toBe(true);
    expect(buffer.recordQuiz('quiz', 1)).toBe(false);
    const result = buffer.snapshot()!;
    expect(
      result.turns.map((turn) => [turn.agentId, turn.durationMs, turn.interventionType]),
    ).toEqual([
      ['agent-a', 1500, 'example'],
      ['agent-b', 800, 'question'],
    ]);
    expect(result.postDiscussionQuiz).toEqual({ sceneId: 'quiz', score: 0 });
    expect(JSON.stringify(result)).not.toContain('privé');
    result.turns[0].agentId = 'mutated';
    expect(buffer.snapshot()!.turns[0].agentId).toBe('agent-a');
  });
  it('keeps absence of outcome distinct from zero and marks interruption honestly', () => {
    const buffer = new DiscussionObservationBuffer(id, 'scene-1', () => 0);
    expect(buffer.snapshot()).toBeNull();
    buffer.startTurn('turn', 'agent');
    expect(buffer.startTurn('turn', 'agent')).toBe(false);
    buffer.end();
    expect(buffer.snapshot()).toMatchObject({
      postDiscussionQuiz: null,
      turns: [{ outcome: 'interrupted', interventionType: 'unknown' }],
    });
    expect(buffer.finishTurn('turn', 'A completed answer', 'completed')).toBe(false);
    expect(buffer.startTurn('next', 'agent')).toBe(false);
  });
  it('refuses overlapping turns, backwards clocks and overflow instead of silently truncating', () => {
    let time = 20;
    const buffer = new DiscussionObservationBuffer(id, 'scene', () => time);
    buffer.startTurn('first', 'agent');
    expect(() => buffer.startTurn('second', 'agent')).toThrow('unfinished');
    time = 10;
    expect(() => buffer.finishTurn('first', '', 'failed')).toThrow('clock');
    time = 30;
    buffer.finishTurn('first', '', 'failed');
    for (let index = 1; index < 256; index++) {
      buffer.startTurn(String(index), 'agent');
      buffer.finishTurn(String(index), 'Answer', 'completed');
    }
    expect(() => buffer.startTurn('overflow', 'agent')).toThrow('capacity');
  });
  it('classifies text heuristically without treating a persona as a joke', () => {
    expect(classifyIntervention('Une réponse sérieuse.', 'class-clown')).toBe('answer');
    expect(classifyIntervention('هل هذا صحيح؟')).toBe('question');
    expect(classifyIntervention('In summary, the result is consistent.')).toBe('synthesis');
    expect(classifyIntervention('')).toBe('unknown');
  });
  it('rejects raw identity/text fields and duplicate turns at the trust boundary', () => {
    const buffer = new DiscussionObservationBuffer(id, 'scene', () => 0);
    buffer.startTurn('turn', 'agent');
    buffer.finishTurn('turn', 'Answer', 'completed');
    buffer.end();
    const observation = buffer.snapshot()!;
    expect(
      discussionObservationSchema.safeParse({ ...observation, userHash: 'supplied-identity' })
        .success,
    ).toBe(false);
    expect(
      discussionObservationSchema.safeParse({
        ...observation,
        turns: [...observation.turns, ...observation.turns],
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';

describe('actual learning observations', () => {
  it('preserves repeated quiz submissions in order without mutating earlier snapshots', () => {
    const buffer = new LearningObservationBuffer('stage', 'epoch', 'session', () => 0);
    buffer.scene('slide', 'slide');
    buffer.quiz('slide', 1);
    buffer.scene('quiz', 'quiz');
    buffer.quiz('quiz', 0);
    const first = buffer.snapshot(['slide', 'quiz'], 1)!;
    buffer.quiz('quiz', 1);
    buffer.quiz('quiz', 1);
    expect(first.sceneObservations?.[1].attempts).toEqual([0]);
    expect(buffer.snapshot(['slide', 'quiz'], 1)).toMatchObject({
      quizScores: [1],
      sceneObservations: [
        { id: 'slide', completed: false },
        { id: 'quiz', score: 1, attempts: [0, 1, 1] },
      ],
    });
    for (let i = 3; i < 512; i++) buffer.quiz('quiz', 1);
    expect(() => buffer.quiz('quiz', 1)).toThrow('capacity');
  });
  it('records foreground time, real completion and quiz zero distinctly from no quiz', () => {
    let now = 0;
    const buffer = new LearningObservationBuffer('stage', 'epoch', 'session', () => now);
    expect(buffer.snapshot(['a', 'b'], 1)).toBeNull();
    buffer.scene('a', 'slide');
    buffer.action('play');
    now = 2000;
    buffer.visibility(false);
    now = 12000;
    buffer.visibility(true);
    now = 15000;
    buffer.complete('a');
    buffer.scene('b', 'quiz');
    expect(buffer.snapshot(['a', 'b'], 1)).toMatchObject({
      sceneDurations: [5, 0],
      completionRate: 0.5,
      quizScores: [],
    });
    buffer.quiz('b', 0);
    now = 17000;
    expect(buffer.snapshot(['a', 'b'], 1)).toMatchObject({
      sceneSequence: ['slide', 'quiz'],
      sceneDurations: [5, 2],
      totalDuration: 7,
      completionRate: 1,
      quizScores: [0],
      language: null,
      level: null,
      sceneObservations: [
        { id: 'a', type: 'slide', seconds: 5, completed: true, score: null },
        { id: 'b', type: 'quiz', seconds: 2, completed: true, score: 0 },
      ],
    });
  });
  it('does not equate navigation with completion or accept unseen quiz results', () => {
    const buffer = new LearningObservationBuffer('stage', 'epoch', 'session', () => 0);
    buffer.scene('a', 'slide');
    buffer.scene('b', 'quiz');
    buffer.complete('unseen');
    buffer.quiz('unseen', 1);
    buffer.quiz('b', Number.NaN);
    expect(buffer.snapshot(['a', 'b'], 1)).toMatchObject({ completionRate: 0, quizScores: [] });
  });
  it('bounds total duration coherently across scenes', () => {
    let now = 0;
    const buffer = new LearningObservationBuffer('stage', 'epoch', 'session', () => now);
    buffer.scene('a', 'slide');
    now = 86400000;
    buffer.scene('b', 'quiz');
    now *= 2;
    const snapshot = buffer.snapshot(['a', 'b'], 1)!;
    expect(snapshot.totalDuration).toBe(86400);
    expect(snapshot.sceneDurations.reduce((sum, value) => sum + value, 0)).toBe(86400);
  });
});

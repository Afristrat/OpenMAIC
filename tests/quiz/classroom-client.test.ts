import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendClassroomQuizAttempt } from '@/lib/quiz/classroom-client';
import {
  registerLearningObservationDrain,
  drainLearningObservations,
} from '@/lib/telemetry/learning-observation-drain';
describe('classroom quiz transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('waits for the matching queued discussion and refuses to race a failed write', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const unregister = registerLearningObservationDrain(
      { orgId: 'org', stageId: 'stage' },
      () => pending,
    );
    const unrelated = registerLearningObservationDrain({ orgId: 'other', stageId: 'stage' }, () => {
      throw new Error('Wrong tenant');
    });
    try {
      const completed = vi.fn();
      const draining = drainLearningObservations(
        { orgId: 'org', stageId: 'stage' },
        new AbortController().signal,
      ).then(completed);
      await Promise.resolve();
      expect(completed).not.toHaveBeenCalled();
      release();
      await draining;
      expect(completed).toHaveBeenCalledOnce();
    } finally {
      unregister();
      unrelated();
    }
    const failing = registerLearningObservationDrain(
      { orgId: 'org', stageId: 'stage' },
      async () => {
        throw new Error('Pending discussion');
      },
    );
    try {
      await expect(
        sendClassroomQuizAttempt(
          'org',
          'stage',
          'quiz',
          {
            requestId: '00000000-0047-4000-8000-000000000001',
            answers: { q: 'a' },
            language: 'fr-FR',
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow('Pending discussion');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      failing();
    }
  });
  it('bounds the drain and honors navigation cancellation', async () => {
    vi.useFakeTimers();
    const unregister = registerLearningObservationDrain(
      { orgId: 'org', stageId: 'stage' },
      () => new Promise(() => {}),
    );
    try {
      const timed = drainLearningObservations(
        { orgId: 'org', stageId: 'stage' },
        new AbortController().signal,
      );
      const assertion = expect(timed).rejects.toThrow('still pending');
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
      const controller = new AbortController();
      const aborted = drainLearningObservations(
        { orgId: 'org', stageId: 'stage' },
        controller.signal,
      );
      const cancellation = expect(aborted).rejects.toThrow();
      controller.abort();
      await cancellation;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      unregister();
      vi.useRealTimers();
    }
  });
  it('sends answers and request identity, never the answer key or score', async () => {
    const id = '00000000-0047-4000-8000-000000000001';
    const response = {
      success: true,
      status: 'completed',
      attemptId: id,
      score: 0,
      results: [{ questionId: 'q', earned: 0, correct: false, status: 'incorrect' }],
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetch);
    expect(
      await sendClassroomQuizAttempt(
        id,
        'stage',
        'quiz',
        { requestId: id, answers: { q: 'a' }, language: 'ar-MA' },
        new AbortController().signal,
      ),
    ).toEqual(response);
    expect(fetch.mock.calls[0][0]).toBe('/api/quiz-attempts');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      orgId: id,
      stageId: 'stage',
      sceneId: 'quiz',
      requestId: id,
      answers: { q: 'a' },
    });
  });
});

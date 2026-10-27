import { describe, expect, test, vi } from 'vitest';
import {
  readVoiceCompletionJob,
  startVoiceCompletionJob,
} from '@/lib/server/voice-completion-jobs';
import type { VoiceCompletionReport } from '@/lib/server/classroom-voice-completion';

const report = (over: Partial<VoiceCompletionReport> = {}): VoiceCompletionReport => ({
  requested: 3,
  generated: 3,
  failed: [],
  updatedScenes: [{ id: 'sc1', actions: [] }],
  ...over,
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('voice completion jobs', () => {
  test('answers at once, then reports progress and the final scenes', async () => {
    let release: (value: VoiceCompletionReport) => void = () => undefined;
    const job = startVoiceCompletionJob(
      { classroomId: 'room-progress', sceneId: 'sc1' },
      (onProgress) =>
        new Promise<VoiceCompletionReport>((resolve) => {
          onProgress({ requested: 3, generated: 1, failed: [] });
          release = resolve;
        }),
    );
    expect(job.status).toBe('running');
    expect(readVoiceCompletionJob(job.id)?.generated).toBe(1);

    release(report());
    await settle();
    const done = readVoiceCompletionJob(job.id);
    expect(done?.status).toBe('succeeded');
    expect(done?.updatedScenes).toHaveLength(1);
  });

  test('a second start for the same scene returns the job already running', async () => {
    let release: (value: VoiceCompletionReport) => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<VoiceCompletionReport>((resolve) => {
          release = resolve;
        }),
    );
    const first = startVoiceCompletionJob({ classroomId: 'room-dedupe', sceneId: 'sc1' }, run);
    const second = startVoiceCompletionJob({ classroomId: 'room-dedupe', sceneId: 'sc1' }, run);
    expect(second.id).toBe(first.id);
    expect(run).toHaveBeenCalledTimes(1);
    release(report());
    await settle();

    const third = startVoiceCompletionJob({ classroomId: 'room-dedupe', sceneId: 'sc1' }, run);
    expect(third.id).not.toBe(first.id);
    release(report());
    await settle();
  });

  test('a blocked balance with nothing generated is a failure with the credits code', async () => {
    const job = startVoiceCompletionJob({ classroomId: 'room-credits' }, async () =>
      report({ generated: 0, creditsBlocked: true, updatedScenes: [] }),
    );
    await settle();
    expect(readVoiceCompletionJob(job.id)).toMatchObject({
      status: 'failed',
      error: 'INSUFFICIENT_CREDITS',
    });
  });

  test('a partial result stays a success and keeps the lines that stayed silent', async () => {
    const job = startVoiceCompletionJob({ classroomId: 'room-partial' }, async () =>
      report({ generated: 2, failed: [{ sceneId: 'sc1', actionId: 'c' }] }),
    );
    await settle();
    const done = readVoiceCompletionJob(job.id);
    expect(done?.status).toBe('succeeded');
    expect(done?.failed).toEqual([{ sceneId: 'sc1', actionId: 'c' }]);
  });

  test('an unexpected error becomes the generic code, a completion error keeps its own code', async () => {
    const unexpected = startVoiceCompletionJob({ classroomId: 'room-boom' }, async () => {
      throw new Error('detail interne');
    });
    const known = startVoiceCompletionJob({ classroomId: 'room-known' }, async () => {
      const error = Object.assign(new Error('Cette classroom ne possède aucun casting vocal.'), {
        code: 'NO_CASTING',
      });
      error.name = 'VoiceCompletionError';
      throw error;
    });
    await settle();
    expect(readVoiceCompletionJob(unexpected.id)?.error).toBe('VOICE_COMPLETION_FAILED');
    expect(readVoiceCompletionJob(known.id)?.error).toBe('NO_CASTING');
  });
});

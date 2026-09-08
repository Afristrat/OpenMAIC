import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLtiAttempt,
  readLtiAttempt,
  readLtiClassroomContext,
  saveLtiAttempt,
  sendLtiQuizAttempt,
} from '@/lib/quiz/lti-client';

const memory = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => memory.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => memory.set(key, value)),
  removeItem: vi.fn((key: string) => memory.delete(key)),
};
const fetchMock = vi.fn();
const id = '00000000-0034-4000-8000-000000000001';
const grade = {
  success: true,
  status: 'queued',
  deliveryId: id,
  score: 75,
  results: [{ questionId: 'q', correct: true, status: 'correct', earned: 3 }],
};
describe('LTI quiz browser boundary', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('reuses the same saved attempt after reload and isolates launch scopes', () => {
    const first = saveLtiAttempt('user:launch:stage:scene', { q: 'A' }, 'fr-FR');
    expect(readLtiAttempt('user:launch:stage:scene')).toEqual(first);
    expect(saveLtiAttempt('user:launch:stage:scene', { q: 'changed' }, 'en-US')).toEqual(first);
    expect(readLtiAttempt('other:launch:stage:scene')).toBeNull();
    clearLtiAttempt('user:launch:stage:scene');
    expect(saveLtiAttempt('user:launch:stage:scene', { q: 'B' }, 'en-US').requestId).not.toBe(
      first.requestId,
    );
  });
  it('fails rather than promising persistence when storage is unavailable', () => {
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(() => saveLtiAttempt('scope', { q: 'A' }, 'ar-MA')).toThrow('quota');
  });
  it('rejects invalid context instead of downgrading to local grading', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(readLtiClassroomContext('stage', new AbortController().signal)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, active: true, gradingEnabled: false, launchId: id }),
    );
    await expect(readLtiClassroomContext('stage', new AbortController().signal)).rejects.toThrow();
  });
  it('polls busy correction with identical request ID and answers, without browser scores', async () => {
    vi.useFakeTimers();
    const attempt = saveLtiAttempt('scope', { q: 'A' }, 'fr-FR');
    fetchMock
      .mockResolvedValueOnce(Response.json({ success: true, status: 'grading' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(grade));
    const result = sendLtiQuizAttempt('stage', 'scene', attempt, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toEqual(grade);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(first).toEqual({ stageId: 'stage', sceneId: 'scene', ...attempt });
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    expect(first).not.toHaveProperty('score');
  });
  it('keeps the saved attempt on HTTP failure and never returns a fallback grade', async () => {
    const attempt = saveLtiAttempt('scope', { q: 'A' }, 'fr-FR');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(
      sendLtiQuizAttempt('stage', 'scene', attempt, new AbortController().signal),
    ).rejects.toThrow();
    expect(readLtiAttempt('scope')).toEqual(attempt);
  });
});

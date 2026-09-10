import { describe, expect, it } from 'vitest';
import { LearningObservationOutbox } from '@/lib/telemetry/learning-observation-outbox';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
function observation() {
  const buffer = new LearningObservationBuffer('stage', other, sessionId, () => 0);
  buffer.scene('scene', 'slide');
  return buffer.snapshot(['scene'], 1)!;
}
describe('persistent learning outbox', () => {
  it('preserves discussion turns through reload and rejects quiz claims before durable storage', () => {
    const disk = storage();
    const queue = new LearningObservationOutbox(owner, disk);
    const buffer = new LearningObservationBuffer('stage', other, sessionId, () => 0, owner);
    buffer.scene('scene', 'slide');
    const scope = { stageId: 'stage', sceneId: 'scene', orgId: owner, discussionId: sessionId };
    buffer.discussionTurn({ ...scope, phase: 'begin' });
    buffer.discussionTurn({ ...scope, phase: 'start', messageId: 'turn', agentId: 'agent' });
    buffer.discussionTurn({
      ...scope,
      phase: 'segment',
      messageId: 'turn',
      interventionType: 'example',
    });
    buffer.discussionTurn({ ...scope, phase: 'turn-end', messageId: 'turn' });
    const sample = buffer.snapshot(['scene'], 1)!;
    queue.put(sample);
    expect(new LearningObservationOutbox(owner, disk).read()).toEqual([sample]);
    expect(() =>
      queue.put({
        ...sample,
        discussions: sample.discussions!.map((item) => ({
          ...item,
          postDiscussionQuiz: { sceneId: 'quiz', score: 1 },
        })),
      }),
    ).toThrow();
    expect(queue.read()).toEqual([sample]);
  });
  it('captures the tenant and refuses reattribution, including for legacy entries', () => {
    const disk = storage();
    const queue = new LearningObservationOutbox(owner, disk);
    const buffer = new LearningObservationBuffer('stage', other, sessionId, () => 0, owner);
    buffer.scene('scene', 'slide');
    const sample = buffer.snapshot(['scene'], 1)!;
    queue.put(sample);
    expect(new LearningObservationOutbox(owner, disk).read()[0].orgId).toBe(owner);
    expect(() => queue.put({ ...sample, orgId: other })).toThrow('immutable');
    queue.clear();
    queue.put(observation());
    expect(queue.read()[0]).not.toHaveProperty('orgId');
    expect(() => queue.put({ ...observation(), orgId: owner })).toThrow('immutable');
  });
  it('survives a new instance, keeps retries immutable and isolates accounts', () => {
    const disk = storage();
    const queue = new LearningObservationOutbox(owner, disk);
    const sample = observation();
    queue.put(sample);
    queue.put(sample);
    expect(new LearningObservationOutbox(owner, disk).read()).toEqual([sample]);
    expect(new LearningObservationOutbox(other, disk).read()).toEqual([]);
    expect(() => queue.put({ ...sample, completionRate: 1 })).toThrow('immutable');
    new LearningObservationOutbox(other, disk).clear();
    expect(queue.read()).toHaveLength(1);
    queue.remove(sample.sessionId);
    expect(queue.read()).toEqual([]);
  });
  it('purges expired and malformed records without touching other storage', () => {
    const disk = storage();
    let now = 1000;
    const queue = new LearningObservationOutbox(owner, disk, () => now);
    queue.put(observation());
    disk.setItem(`qalem-learning-outbox:v1:${owner}:invalid`, '{');
    disk.setItem('settings-storage', 'unchanged');
    now += 7 * 86400000;
    expect(queue.read()).toEqual([]);
    expect(disk.length).toBe(1);
    expect(disk.getItem('settings-storage')).toBe('unchanged');
  });
  it('does not hide storage failures or overwrite another pending session', () => {
    const disk = storage();
    const queue = new LearningObservationOutbox(owner, disk);
    queue.put(observation());
    queue.put({ ...observation(), sessionId: owner });
    expect(queue.read()).toHaveLength(2);
    disk.setItem = () => {
      throw new Error('quota');
    };
    expect(() => queue.put({ ...observation(), sessionId: other })).toThrow('quota');
    expect(queue.read()).toHaveLength(2);
  });
});

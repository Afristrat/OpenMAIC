import { describe, expect, it } from 'vitest';
import { blockingScenes } from '@/lib/export/coherence-gate';
import type { SceneCoherenceReport } from '@/lib/export/coherence';

const CHECKED_AT = '2026-11-02T10:00:00.000Z';
const report = (
  sceneId: string,
  verdict: SceneCoherenceReport['verdict'],
): SceneCoherenceReport => ({
  sceneId,
  title: sceneId,
  verdict,
  problems: [],
});

describe('blockingScenes', () => {
  it('keeps only incoherent scenes that have not changed since the check', () => {
    const blocking = blockingScenes(
      [report('a', 'incoherent'), report('b', 'partial'), report('c', 'coherent')],
      new Map([
        ['a', '2026-11-02T09:00:00.000Z'],
        ['b', '2026-11-02T09:00:00.000Z'],
        ['c', '2026-11-02T09:00:00.000Z'],
      ]),
      CHECKED_AT,
    );
    expect(blocking.map((scene) => scene.sceneId)).toEqual(['a']);
  });

  it('releases a scene the author edited after the check', () => {
    const blocking = blockingScenes(
      [report('a', 'incoherent')],
      new Map([['a', '2026-11-02T10:00:01.000Z']]),
      CHECKED_AT,
    );
    expect(blocking).toEqual([]);
  });

  it('ignores a scene that no longer exists and blocks one with no edit date', () => {
    const blocking = blockingScenes(
      [report('gone', 'incoherent'), report('undated', 'incoherent')],
      new Map([['undated', null]]),
      CHECKED_AT,
    );
    expect(blocking.map((scene) => scene.sceneId)).toEqual(['undated']);
  });
});

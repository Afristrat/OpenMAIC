import { describe, expect, it } from 'vitest';
import {
  LIVENESS_SLOW_MS,
  LIVENESS_STALLED_MS,
  courseStepPosition,
  describeGenerationFailure,
  formatDuration,
  getLiveness,
  planStepPosition,
  summarizeTypicalDuration,
} from '@/lib/generation/generation-tracking';

describe('describeGenerationFailure', () => {
  it('explains a scene count mismatch with both numbers', () => {
    expect(describeGenerationFailure('SCENE_COUNT_MISMATCH: requested 1, received 15')).toEqual({
      code: 'SCENE_COUNT_MISMATCH',
      params: { requested: 1, received: 15 },
    });
  });

  it.each([
    ['OpenAI image generation failed (429): budget exceeded', 'PROVIDER_QUOTA'],
    ['LLM call failed: 401 Unauthorized', 'PROVIDER_AUTH'],
    ['Request timed out after 300000 ms', 'PROVIDER_TIMEOUT'],
    ['OpenAI TTS API error: Internal Server Error', 'PROVIDER_UNAVAILABLE'],
    ['fetch failed', 'PROVIDER_UNAVAILABLE'],
  ])('classifies %s', (raw, code) => {
    expect(describeGenerationFailure(raw)?.code).toBe(code);
  });

  it('keeps unknown errors raw instead of inventing an explanation', () => {
    expect(describeGenerationFailure('Something specific broke')).toBeUndefined();
    expect(describeGenerationFailure(undefined)).toBeUndefined();
  });
});

describe('steps and liveness', () => {
  it('positions plan steps and folds the correction pass onto the design step', () => {
    expect(planStepPosition('reading_sources')).toBe(0);
    expect(planStepPosition('designing_plan')).toBe(2);
    expect(planStepPosition('correcting_plan')).toBe(2);
    expect(planStepPosition('finalizing')).toBe(3);
    expect(planStepPosition(undefined)).toBe(0);
  });

  it('positions course steps', () => {
    expect(courseStepPosition('generating_scenes')).toBe(3);
    expect(courseStepPosition('persisting')).toBe(6);
  });

  it('distinguishes a long step from a silent server', () => {
    expect(getLiveness(10_000)).toBe('active');
    expect(getLiveness(LIVENESS_SLOW_MS)).toBe('slow');
    expect(getLiveness(LIVENESS_STALLED_MS)).toBe('stalled');
  });
});

describe('durations', () => {
  const labels = { seconds: (n: number) => `${n} s`, minutes: (n: number) => `${n} min` };

  it('formats short spans in seconds and long ones in minutes', () => {
    expect(formatDuration(12_000, labels)).toBe('12 s');
    expect(formatDuration(14 * 60_000, labels)).toBe('14 min');
    expect(formatDuration(-5, labels)).toBe('0 s');
  });

  it('summarizes the usual duration only from enough real samples', () => {
    expect(summarizeTypicalDuration([60_000, 120_000])).toBeUndefined();
    const summary = summarizeTypicalDuration([
      60_000, 120_000, 180_000, 240_000, 300_000, 360_000, 420_000, 480_000,
    ]);
    expect(summary).toEqual({ lowMs: 180_000, highMs: 420_000, sampleSize: 8 });
  });
});

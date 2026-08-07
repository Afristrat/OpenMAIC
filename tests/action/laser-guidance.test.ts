import { describe, expect, it } from 'vitest';
import { buildLaserPath } from '@/components/slide-renderer/Editor/LaserOverlay';
import { DEFAULT_VISUAL_EFFECT_DURATION_MS, visualEffectDurationMs } from '@/lib/action/engine';

describe('laser guidance', () => {
  it('sweeps the complete useful area of a wide target', () => {
    const path = buildLaserPath({ x: 10, y: 20, w: 60, h: 30, centerX: 40, centerY: 35 });

    expect(Math.min(...path.x)).toBeLessThan(20);
    expect(Math.max(...path.x)).toBeGreaterThan(60);
    expect(Math.min(...path.y)).toBeLessThan(30);
    expect(Math.max(...path.y)).toBeGreaterThan(40);
    expect(path.times).toHaveLength(path.x.length);
    expect(path.y).toHaveLength(path.x.length);
  });

  it('keeps a small target steady instead of creating visual noise', () => {
    expect(buildLaserPath({ x: 49, y: 49, w: 2, h: 2, centerX: 50, centerY: 50 })).toEqual({
      x: [50, 50],
      y: [50, 50],
      times: [0, 1],
    });
  });

  it('uses a readable default and clamps authored durations', () => {
    expect(visualEffectDurationMs()).toBe(DEFAULT_VISUAL_EFFECT_DURATION_MS);
    expect(visualEffectDurationMs(500)).toBe(2000);
    expect(visualEffectDurationMs(60000)).toBe(30000);
  });
});

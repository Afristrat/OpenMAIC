import { describe, expect, it } from 'vitest';
import { sceneIndexFromSliderValue } from '@/components/canvas/canvas-toolbar';

describe('playback scene slider', () => {
  it('maps the slider value to a valid scene index', () => {
    expect(sceneIndexFromSliderValue('3', 6)).toBe(3);
    expect(sceneIndexFromSliderValue('99', 6)).toBe(5);
    expect(sceneIndexFromSliderValue('-2', 6)).toBe(0);
  });

  it('stays on the first position when the classroom has no scene', () => {
    expect(sceneIndexFromSliderValue('4', 0)).toBe(0);
  });
});

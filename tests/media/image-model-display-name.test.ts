import { describe, expect, it } from 'vitest';
import { getImageModelDisplayName } from '@/lib/media/image-providers';

describe('getImageModelDisplayName', () => {
  it('labels the managed Gemini image models without changing their request IDs', () => {
    expect(getImageModelDisplayName('gemini-3.1-flash-image')).toBe(
      'Gemini 3.1 Flash Image — rapide',
    );
    expect(getImageModelDisplayName('gemini-3-pro-image')).toBe(
      'Gemini 3 Pro Image — qualité',
    );
  });

  it('preserves an unknown model ID so newly-managed providers remain usable', () => {
    expect(getImageModelDisplayName('future-image-model')).toBe('future-image-model');
  });
});

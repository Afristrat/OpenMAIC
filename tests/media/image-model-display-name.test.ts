import { describe, expect, it } from 'vitest';
import { getImageModelDisplayName } from '@/lib/media/image-providers';

describe('getImageModelDisplayName', () => {
  const translate = (key: string) => `translated:${key}`;

  it('resolves the managed Gemini labels through the UI translation layer', () => {
    expect(getImageModelDisplayName('gemini-3.1-flash-image', translate)).toBe(
      'translated:media.imageModelGeminiFlash',
    );
    expect(getImageModelDisplayName('gemini-3-pro-image', translate)).toBe(
      'translated:media.imageModelGeminiPro',
    );
  });

  it('preserves an unknown model ID so newly-managed providers remain usable', () => {
    expect(getImageModelDisplayName('future-image-model', translate)).toBe('future-image-model');
  });
});

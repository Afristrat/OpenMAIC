import { describe, expect, test } from 'vitest';
import { shouldUseOcrFallback } from '@/lib/document/pdf-text-quality';

describe('PDF text quality', () => {
  test('routes empty and control-character-heavy extraction to OCR', () => {
    expect(shouldUseOcrFallback('   ')).toBe(true);
    expect(shouldUseOcrFallback('Titre\u0003\u0003\u0003WUDYDLO\u0003\u0003\u0003')).toBe(true);
  });

  test('keeps readable multilingual text with ordinary punctuation', () => {
    expect(
      shouldUseOcrFallback(
        'Objectif général : sécuriser la clôture de caisse. المتطلبات الأساسية واضحة.',
      ),
    ).toBe(false);
  });
});

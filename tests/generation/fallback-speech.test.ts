import { describe, expect, it } from 'vitest';
import { localizedFallbackSpeech, type FallbackSpeechKind } from '@/lib/generation/scene-generator';

const KINDS: FallbackSpeechKind[] = ['quiz', 'interactive', 'pbl'];
const HAN = /[一-鿿]/u;

describe('localizedFallbackSpeech', () => {
  it.each(KINDS)('ne produit jamais de chinois pour %s, quelle que soit la langue', (kind) => {
    for (const directive of ['français', 'fr-FR', 'arabe', 'ar-MA', 'English', undefined]) {
      const { title, text } = localizedFallbackSpeech(kind, directive);
      expect(title).not.toMatch(HAN);
      expect(text).not.toMatch(HAN);
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it('suit la langue du cours', () => {
    expect(localizedFallbackSpeech('quiz', 'français').text).toMatch(/quiz/);
    expect(localizedFallbackSpeech('quiz', 'ar-MA').text).toMatch(/[؀-ۿ]/u);
    expect(localizedFallbackSpeech('quiz', 'English').text).toMatch(/quiz/);
  });
});

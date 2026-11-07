import { describe, expect, it } from 'vitest';
import {
  fallbackQuestionText,
  localizedFallbackSpeech,
  type FallbackSpeechKind,
} from '@/lib/generation/scene-generator';

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

describe('fallbackQuestionText', () => {
  const outline = {
    id: 's1',
    order: 1,
    title: 'Chapitre 3 : Scénarios chiffrés',
    keyPoints: ['Hypothèses de base.', 'Comparaison des trois scénarios'],
  } as unknown as Parameters<typeof fallbackQuestionText>[0];

  it('porte sur un point clé et non sur le titre', () => {
    const text = fallbackQuestionText(outline, 'français');
    expect(text).toContain('Comparaison des trois scénarios');
    expect(text).not.toContain('Chapitre 3');
    expect(text).not.toMatch(HAN);
  });

  it('retombe sur le titre sans point clé et suit la langue', () => {
    const bare = { ...outline, keyPoints: [] };
    expect(fallbackQuestionText(bare, 'français')).toContain('Chapitre 3 : Scénarios chiffrés');
    expect(fallbackQuestionText(outline, 'ar-MA')).toMatch(/[؀-ۿ]/u);
    expect(fallbackQuestionText(outline, 'English')).toContain('How would you apply');
  });
});

describe('fallbackQuestionText, entrées hostiles', () => {
  const base = { id: 's1', title: 'Titre de scène' };

  it('accepte un rang fractionnaire ou absent sans lever d’erreur', () => {
    for (const order of [1.5, -2.7, undefined, Number.NaN]) {
      const outline = { ...base, order, keyPoints: ['Un point', 'Un autre'] };
      expect(() =>
        fallbackQuestionText(
          outline as unknown as Parameters<typeof fallbackQuestionText>[0],
          'français',
        ),
      ).not.toThrow();
    }
  });

  it('retombe sur le titre pour un point clé trop long, sans ralentir', () => {
    const long = `${'.'.repeat(60000)}x${' '.repeat(60000)}`;
    const outline = { ...base, order: 0, keyPoints: [long] };
    const started = Date.now();
    const text = fallbackQuestionText(
      outline as unknown as Parameters<typeof fallbackQuestionText>[0],
      'français',
    );
    expect(Date.now() - started).toBeLessThan(200);
    expect(text).toContain('Titre de scène');
  });

  it('essaie les autres points clés avant de se rabattre sur le titre', () => {
    const tooLong = 'a'.repeat(400);
    const outline = { ...base, order: 0, keyPoints: [tooLong, 'Point clé exploitable'] };
    const text = fallbackQuestionText(
      outline as unknown as Parameters<typeof fallbackQuestionText>[0],
      'français',
    );
    expect(text).toContain('Point clé exploitable');
    expect(text).not.toContain('Titre de scène');
  });
});

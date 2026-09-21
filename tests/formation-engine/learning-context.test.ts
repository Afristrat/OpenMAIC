import { describe, expect, it } from 'vitest';
import {
  AFRICAN_COUNTRIES,
  buildLearningContextDirective,
  currencyForTerritory,
  normalizeLearningContext,
} from '@/lib/formation-engine/learning-context';

describe('learning context', () => {
  it('covers every African country and resolves its currency without accents or case sensitivity', () => {
    expect(AFRICAN_COUNTRIES).toHaveLength(54);
    expect(new Set(AFRICAN_COUNTRIES.map(([country]) => country)).size).toBe(54);
    expect(currencyForTerritory('sénégal')).toBe('XOF');
    expect(currencyForTerritory('KENYA')).toBe('KES');
    expect(currencyForTerritory('Afrique du Sud')).toBe('ZAR');
  });

  it('normalizes and grounds every monetary example in the selected currency', () => {
    const context = normalizeLearningContext({ territory: ' Maroc ', currencyCode: 'mad' });
    const directive = buildLearningContextDirective(context, 'fr-FR');

    expect(context).toEqual({ territory: 'Maroc', currencyCode: 'MAD' });
    expect(directive).toContain('Pays ou territoire : Maroc');
    expect(directive).toContain('Code ISO 4217 interne de la devise de référence : MAD');
    expect(directive).toContain('« dirham » pour un montant exactement égal à 1');
    expect(directive).toContain('« dirhams » dans les autres cas');
    expect(directive).toContain('ne jamais afficher le code MAD');
    expect(directive).toContain('taux de change actuel et sourcé');
  });

  it('keeps MAD internal and leaves other locales and currencies unchanged', () => {
    const english = buildLearningContextDirective(
      { territory: 'Morocco', currencyCode: 'MAD' },
      'en-US',
    );
    const frenchEuro = buildLearningContextDirective(
      { territory: 'France', currencyCode: 'EUR' },
      'fr-FR',
    );

    expect(english).toContain('Use MAD for every amount');
    expect(english).not.toContain('dirhams');
    expect(frenchEuro).toContain('Utiliser EUR pour tous les montants');
    expect(frenchEuro).not.toContain('dirhams');
  });

  it('rejects a missing territory or malformed ISO code', () => {
    expect(() => buildLearningContextDirective({ territory: '', currencyCode: 'EUR' })).toThrow();
    expect(() =>
      buildLearningContextDirective({ territory: 'France', currencyCode: 'EURO' }),
    ).toThrow();
  });
});

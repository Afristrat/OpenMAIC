import { describe, expect, it } from 'vitest';
import {
  buildLearningContextDirective,
  normalizeLearningContext,
} from '@/lib/formation-engine/learning-context';

describe('learning context', () => {
  it('normalizes and grounds every monetary example in the selected currency', () => {
    const context = normalizeLearningContext({ territory: ' Maroc ', currencyCode: 'mad' });
    const directive = buildLearningContextDirective(context, 'fr-FR');

    expect(context).toEqual({ territory: 'Maroc', currencyCode: 'MAD' });
    expect(directive).toContain('Pays ou territoire : Maroc');
    expect(directive).toContain('Devise de référence : MAD');
    expect(directive).toContain('taux de change actuel et sourcé');
  });

  it('rejects a missing territory or malformed ISO code', () => {
    expect(() =>
      buildLearningContextDirective({ territory: '', currencyCode: 'EUR' }),
    ).toThrow();
    expect(() =>
      buildLearningContextDirective({ territory: 'France', currencyCode: 'EURO' }),
    ).toThrow();
  });
});

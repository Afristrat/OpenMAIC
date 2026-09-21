import { describe, expect, it } from 'vitest';
import { resolveCountryCurrency } from '@/lib/formation-engine/country-resolver';

describe('resolveCountryCurrency', () => {
  it.each([
    ['Canada', 'CAD'],
    ['Allemagne', 'EUR'],
    ['السعودية', 'SAR'],
  ])('resolves %s without a remote provider', (country, currency) => {
    expect(resolveCountryCurrency(country)?.currencyCode).toBe(currency);
  });

  it('rejects an unknown territory', () => {
    expect(resolveCountryCurrency('Pays inventé')).toBeNull();
  });
});

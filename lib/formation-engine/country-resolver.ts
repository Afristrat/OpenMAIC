import { getCountryDataList } from 'countries-list';

const REGION_LOCALES = ['fr-FR', 'ar-MA', 'en-US'] as const;

function normalizeCountryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

const regionNames = REGION_LOCALES.map(
  (locale) => new Intl.DisplayNames([locale], { type: 'region' }),
);

export function resolveCountryCurrency(countryName: string): {
  canonicalCountryName: string;
  currencyCode: string;
  languageCode?: string;
} | null {
  const query = normalizeCountryName(countryName);
  if (!query) return null;

  for (const country of getCountryDataList()) {
    const names = [
      country.name,
      country.native,
      ...(country.alias ?? []),
      ...regionNames.map((displayNames) => displayNames.of(country.iso2)).filter(Boolean),
    ];
    const matches = names.some((name) => {
      const candidate = normalizeCountryName(name ?? '');
      return (
        candidate === query || candidate.endsWith(` ${query}`) || query.endsWith(` ${candidate}`)
      );
    });
    if (!matches) continue;

    const currencyCode = country.currency[0];
    if (!currencyCode) return null;
    return {
      canonicalCountryName: countryName.trim(),
      currencyCode,
      languageCode: country.languages[0],
    };
  }

  return null;
}

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import cleanroomContract from '@/refork/i18n-cleanroom-contract.json';
import dynamicContract from '@/refork/i18n-dynamic-keys.json';
import arabic from '@/lib/i18n/locales/ui-ar-MA.json';
import english from '@/lib/i18n/locales/ui-en-US.json';
import french from '@/lib/i18n/locales/ui-fr-FR.json';

const englishCatalog = english as Record<string, string>;
const catalogs: Record<string, Record<string, string>> = {
  'en-US': englishCatalog,
  'fr-FR': french as Record<string, string>,
  'ar-MA': arabic as Record<string, string>,
};

function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)].map((match) => match[1]).sort();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function literalTranslationKeys(): string[] {
  const keys = new Set<string>();
  const callPattern =
    /(?<![A-Za-z0-9_])(?:t|translate|getClientTranslation)\s*\(\s*['"]([^'"]+)['"]/g;

  for (const root of ['app', 'components', 'lib']) {
    for (const path of sourceFiles(join(process.cwd(), root))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(callPattern)) {
        if (!match[1].endsWith('.')) keys.add(match[1]);
      }
    }
  }

  return [...keys].sort();
}

describe('Qalem clean-room locale contract', () => {
  it('has exact key parity across French, Arabic and English', () => {
    const expected = Object.keys(englishCatalog).sort();
    expect(Object.keys(french).sort()).toEqual(expected);
    expect(Object.keys(arabic).sort()).toEqual(expected);
  });

  it('contains every Qalem key extracted without historical values', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of cleanroomContract.required_custom_keys) {
        expect(catalog, `${locale} is missing ${key}`).toHaveProperty(key);
      }
    }
  });

  it('resolves every finite runtime-generated key', () => {
    expect(dynamicContract.keys).toHaveLength(193);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const entry of dynamicContract.keys) {
        expect(catalog, `${locale} is missing dynamic key ${entry.key}`).toHaveProperty(entry.key);
        expect(placeholders(catalog[entry.key]), `${locale}:${entry.key}`).toEqual(
          [...entry.placeholders].sort(),
        );
      }
    }
  });

  it('resolves every literal translation key used by the application', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of literalTranslationKeys()) {
        expect(catalog, `${locale} is missing literal key ${key}`).toHaveProperty(key);
      }
    }
  });

  it('contains no empty or unresolved values', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(typeof value, `${locale}:${key}`).toBe('string');
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
        expect(value, `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it('keeps placeholder names aligned across locales', () => {
    for (const key of Object.keys(englishCatalog)) {
      expect(placeholders(catalogs['fr-FR'][key]), `fr-FR:${key}`).toEqual(
        placeholders(englishCatalog[key]),
      );
      expect(placeholders(catalogs['ar-MA'][key]), `ar-MA:${key}`).toEqual(
        placeholders(englishCatalog[key]),
      );
    }
  });
});

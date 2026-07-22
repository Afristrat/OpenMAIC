import i18n from './config';
import { defaultLocale, type Locale } from './types';
import type { LocaleEntry } from './locales';

export { defaultLocale, type Locale } from './types';
export { type LocaleEntry, supportedLocales } from './locales';
export type TranslationKey = string;

export const qalemUiLocales = [
  { code: 'fr-FR', label: 'Français', shortLabel: 'FR' },
  { code: 'en-US', label: 'English', shortLabel: 'EN' },
  { code: 'ar-MA', label: 'العربية', shortLabel: 'AR' },
] as const satisfies readonly LocaleEntry[];

export function translate(locale: Locale, key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ...options, lng: locale, defaultValue: key });
}

export function getClientTranslation(key: string, options?: Record<string, unknown>): string {
  let locale: Locale = defaultLocale;

  if (typeof window !== 'undefined') {
    try {
      const storedLocale = localStorage.getItem('locale');
      if (
        storedLocale === 'zh-CN' ||
        storedLocale === 'en-US' ||
        storedLocale === 'fr-FR' ||
        storedLocale === 'ar-MA'
      ) {
        locale = storedLocale;
      }
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }

  return translate(locale, key, options);
}

import { defaultLocale, type Locale } from './types';
export { type Locale, defaultLocale } from './types';
import { commonZhCN, commonEnUS, commonFrFR, commonArMA } from './common';
import { stageZhCN, stageEnUS, stageFrFR, stageArMA } from './stage';
import { chatZhCN, chatEnUS, chatFrFR, chatArMA } from './chat';
import { generationZhCN, generationEnUS, generationFrFR, generationArMA } from './generation';
import { settingsZhCN, settingsEnUS, settingsFrFR, settingsArMA } from './settings';

export const translations = {
  'zh-CN': {
    ...commonZhCN,
    ...stageZhCN,
    ...chatZhCN,
    ...generationZhCN,
    ...settingsZhCN,
  },
  'en-US': {
    ...commonEnUS,
    ...stageEnUS,
    ...chatEnUS,
    ...generationEnUS,
    ...settingsEnUS,
  },
  'fr-FR': {
    ...commonFrFR,
    ...stageFrFR,
    ...chatFrFR,
    ...generationFrFR,
    ...settingsFrFR,
  },
  'ar-MA': {
    ...commonArMA,
    ...stageArMA,
    ...chatArMA,
    ...generationArMA,
    ...settingsArMA,
  },
} as const;

export type TranslationKey = keyof (typeof translations)[typeof defaultLocale];

export function translate(locale: Locale, key: string): string {
  const keys = key.split('.');
  let value: unknown = translations[locale];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }
  return (typeof value === 'string' ? value : undefined) ?? key;
}

export function getClientTranslation(key: string): string {
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
      // localStorage unavailable, keep default locale
    }
  }

  return translate(locale, key);
}

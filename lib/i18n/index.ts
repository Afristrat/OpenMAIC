import { defaultLocale, type Locale } from './types';
export { type Locale, defaultLocale } from './types';
export { type LocaleEntry, supportedLocales } from './locales';
import type { LocaleEntry } from './locales';
import { commonZhCN, commonEnUS, commonFrFR, commonArMA } from './common';
import { stageZhCN, stageEnUS, stageFrFR, stageArMA } from './stage';
import { chatZhCN, chatEnUS, chatFrFR, chatArMA } from './chat';
import { generationZhCN, generationEnUS, generationFrFR, generationArMA } from './generation';
import { settingsZhCN, settingsEnUS, settingsFrFR, settingsArMA } from './settings';
import {
  videoCapsulesZhCN,
  videoCapsulesEnUS,
  videoCapsulesFrFR,
  videoCapsulesArMA,
} from './video-capsules';
import upstreamI18n from './config';

export const translations = {
  'zh-CN': {
    ...commonZhCN,
    ...stageZhCN,
    ...chatZhCN,
    ...generationZhCN,
    ...settingsZhCN,
    ...videoCapsulesZhCN,
  },
  'en-US': {
    ...commonEnUS,
    ...stageEnUS,
    ...chatEnUS,
    ...generationEnUS,
    ...settingsEnUS,
    ...videoCapsulesEnUS,
  },
  'fr-FR': {
    ...commonFrFR,
    ...stageFrFR,
    ...chatFrFR,
    ...generationFrFR,
    ...settingsFrFR,
    ...videoCapsulesFrFR,
  },
  'ar-MA': {
    ...commonArMA,
    ...stageArMA,
    ...chatArMA,
    ...generationArMA,
    ...settingsArMA,
    ...videoCapsulesArMA,
  },
} as const;

export type TranslationKey = keyof (typeof translations)[typeof defaultLocale];

/**
 * Locales exposed in the UI switcher (Qalem: FR/AR/EN). Distinct from
 * `supportedLocales` (lib/i18n/locales.ts), which is the broader BCP-47
 * registry used for content-language validation (e.g. lib/pbl/v2's
 * `project.language` sync) and inherited from upstream v0.3.0 — `zh-CN` is
 * a valid `Locale` (see lib/i18n/types.ts) and a valid content language
 * there, but must never be user-selectable in this switcher.
 */
export const qalemUiLocales = [
  { code: 'fr-FR', label: 'Français', shortLabel: 'FR' },
  { code: 'en-US', label: 'English', shortLabel: 'EN' },
  { code: 'ar-MA', label: 'العربية', shortLabel: 'AR' },
] as const satisfies readonly LocaleEntry[];

/**
 * Fallback for keys with no Qalem-authored equivalent yet. Upstream v0.3.0
 * introduced several UI areas (PBL v2 workspace `pbl.v2.*`, the rewritten
 * slide editor `edit.*`, outline editor summaries, classroom-complete quiz
 * scoring…) whose text ships only as i18next resources
 * (lib/i18n/config.ts + lib/i18n/locales/*.json), with no equivalent in
 * Qalem's native common/chat/generation/settings/stage content. Resource
 * coverage there is English (en-US) and Arabic (ar-MA, reusing upstream's
 * ar-SA MSA content verbatim — see lib/i18n/locales/ar-MA.json). French has
 * no upstream resource, so French users see English text for these
 * not-yet-ported namespaces (tracked in .ralph/progress.md Known Issues).
 * `options` (i18next-style `{{var}}` interpolation values) is forwarded so
 * these upstream strings still interpolate correctly.
 */
function translateUpstreamFallback(
  locale: Locale,
  key: string,
  options?: Record<string, unknown>,
): string | undefined {
  const value = upstreamI18n.t(key, { ...options, lng: locale });
  return value !== key ? value : undefined;
}

export function translate(locale: Locale, key: string, options?: Record<string, unknown>): string {
  const keys = key.split('.');
  let value: unknown = translations[locale];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }
  if (typeof value === 'string') return value;
  return translateUpstreamFallback(locale, key, options) ?? key;
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
      // localStorage unavailable, keep default locale
    }
  }

  return translate(locale, key, options);
}

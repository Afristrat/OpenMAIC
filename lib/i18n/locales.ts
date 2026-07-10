export type LocaleEntry = {
  code: string;
  /** Native name shown in dropdown, e.g. '简体中文' */
  label: string;
  /** Short label shown on the toggle button, e.g. 'CN' */
  shortLabel: string;
};

/**
 * Supported locales registry — the broad BCP-47-ish set recognized as valid
 * *content* languages system-wide (e.g. `project.language` sync in
 * lib/pbl/v2/api/locale.ts, see tests/pbl/v2/locale.test.ts). Inherited from
 * upstream v0.3.0; `fr-FR` and `ar-MA` were added so Qalem's real UI locales
 * are also recognized here.
 *
 * This is NOT the list shown in the language switcher dropdown — see
 * `qalemUiLocales` in lib/i18n/index.ts for that (Qalem: FR/AR/EN only).
 *
 * To add a new content language:
 *   1. Create `lib/i18n/locales/<code>.json` (copy an existing file as template)
 *   2. Add an entry here
 */
export const supportedLocales = [
  { code: 'zh-CN', label: '简体中文', shortLabel: 'CN' },
  { code: 'zh-TW', label: '繁體中文', shortLabel: 'TW' },
  { code: 'en-US', label: 'English', shortLabel: 'EN' },
  { code: 'ja-JP', label: '日本語', shortLabel: 'JA' },
  { code: 'ru-RU', label: 'Русский', shortLabel: 'RU' },
  { code: 'ar-SA', label: 'العربية', shortLabel: 'AR' },
  { code: 'pt-BR', label: 'Português (Brasil)', shortLabel: 'BR' },
  { code: 'ko-KR', label: '한국어', shortLabel: 'KO' },
  { code: 'fr-FR', label: 'Français', shortLabel: 'FR' },
  { code: 'ar-MA', label: 'العربية (المغرب)', shortLabel: 'AR' },
] as const satisfies readonly LocaleEntry[];

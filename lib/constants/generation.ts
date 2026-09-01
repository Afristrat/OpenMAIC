/**
 * Constants for PDF content generation
 * Shared between client and server code
 */

// PDF content truncation limit (characters)
export const MAX_PDF_CONTENT_CHARS = 50000;

// Maximum number of images to send as vision content parts
export const MAX_VISION_IMAGES = 20;

/**
 * BCP-47 locale code → natural-language directive for the LLM prompt.
 * Single source of truth: consumed both by the Dexie `languageDirective`
 * migration (lib/utils/database.ts) and by the course-generation UI
 * (app/(private)/app/page.tsx), which need the exact same mapping.
 */
export const LOCALE_TO_LANGUAGE_DIRECTIVE: Record<string, string> = {
  'fr-FR': 'Deliver the entire course in French (fr-FR).',
  'ar-MA': 'Deliver the entire course in Modern Standard Arabic (ar-MA).',
  'en-US': 'Deliver the entire course in English (en-US).',
  'zh-CN': 'Deliver the entire course in Chinese (Simplified, zh-CN).',
  'ja-JP': 'Deliver the entire course in Japanese (ja-JP).',
  'ru-RU': 'Deliver the entire course in Russian (ru-RU).',
};

/** Build an explicit language directive sentence for a given locale code. */
export function buildLanguageDirective(locale: string): string {
  return LOCALE_TO_LANGUAGE_DIRECTIVE[locale] || `Deliver the entire course in ${locale}.`;
}

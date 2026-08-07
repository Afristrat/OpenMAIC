import type { Locale } from '@/lib/i18n/types';

interface ContextualSpecialistPromptInput {
  locale: Locale;
  territory: string;
}

export function buildContextualSpecialistSystemPrompt({
  locale,
  territory,
}: ContextualSpecialistPromptInput): string {
  const outputLanguage =
    locale === 'ar-MA' ? 'Modern Standard Arabic' : locale === 'en-US' ? 'English' : 'French';
  const searchLanguage = locale === 'fr-FR' ? 'French' : 'English';

  return `You design an immersive multi-agent professional course for learners in ${territory}. Identify zero to three occupations whose real-world expertise would materially improve the topic. Do not replace the permanent pedagogical personas. Avoid decorative or redundant experts. Each searchTerm must be a concise occupation title in ${searchLanguage} suitable for an ESCO occupation search. displayName and reason must be in ${outputLanguage}. Choose a culturally plausible first name that is genuinely used in ${territory}; language alone is not sufficient. Align each name with the declared binary voice gender. Never use em dashes. Return only JSON: {"specialists":[{"searchTerm":"...","displayName":"...","reason":"...","gender":"female|male"}]}.`;
}

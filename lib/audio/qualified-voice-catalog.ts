import type { TTSVoiceInfo } from './types';

export type QualifiedVoiceLanguage = 'fr-FR' | 'en-US';

export interface QualifiedVoiceCatalogEntry extends TTSVoiceInfo {
  providerId: 'higgs-tts';
  languages: QualifiedVoiceLanguage[];
  verifiedAt: string;
  previewTextByLanguage: Record<QualifiedVoiceLanguage, string>;
}

const previewText = (name: string): Record<QualifiedVoiceLanguage, string> => ({
  'fr-FR': `Bonjour, je suis ${name}. Voici un aperçu de ma voix pour vos formations Qalem.`,
  'en-US': `Hello, I am ${name}. This is a preview of my voice for your Qalem courses.`,
});

const qualifiedVoice = (
  id: string,
  name: string,
  gender: 'female' | 'male',
): QualifiedVoiceCatalogEntry => ({
  id,
  name,
  providerId: 'higgs-tts',
  language: 'fr-FR',
  languages: ['fr-FR', 'en-US'],
  gender,
  verifiedAt: '2026-08-27',
  previewTextByLanguage: previewText(name),
});

/**
 * Target catalog for S6-012.
 *
 * Every profile below was present in the live Higgs `/health` response on
 * 2026-08-27. A profile is listed for both languages only after the real Qalem
 * TTS route has produced a non-empty WAV with an explicit FR/EN language.
 * Human listening remains a separate acceptance gate in the PRD.
 */
export const HIGGS_QUALIFIED_VOICE_CATALOG = [
  qualifiedVoice('hanae', 'Hanae', 'female'),
  qualifiedVoice('mehdi', 'Mehdi', 'male'),
  qualifiedVoice('rim', 'Rim', 'female'),
  qualifiedVoice('salma', 'Salma', 'female'),
  qualifiedVoice('younes', 'Younes', 'male'),
  qualifiedVoice('hamza', 'Hamza', 'male'),
  qualifiedVoice('khalid', 'Khalid', 'male'),
  qualifiedVoice('layla', 'Layla', 'female'),
  qualifiedVoice('maryam', 'Maryam', 'female'),
  qualifiedVoice('sana', 'Sana', 'female'),
] satisfies QualifiedVoiceCatalogEntry[];

export function getQualifiedVoicesForLanguage(
  language: QualifiedVoiceLanguage,
): QualifiedVoiceCatalogEntry[] {
  return HIGGS_QUALIFIED_VOICE_CATALOG.filter((voice) => voice.languages.includes(language));
}

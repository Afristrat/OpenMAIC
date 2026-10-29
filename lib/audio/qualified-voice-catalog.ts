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

/**
 * Ordered fallback voices per gender, used when the Higgs server refuses the requested voice
 * (HTTP 5xx on every line, measured: broken reference audio).
 * Higgs voices verified to answer 200 on 2026-10-25: men younes, mehdi, tariq, amine; women
 * salma, rim, hanae. Re-verify against the live server before editing; a voice that starts
 * failing must leave this list.
 */
export const HIGGS_FALLBACK_VOICES_BY_GENDER = {
  male: ['younes', 'mehdi', 'tariq', 'amine'],
  female: ['salma', 'rim', 'hanae'],
} as const satisfies Record<'male' | 'female', readonly string[]>;

/** Gender of a Higgs voice from the qualified catalog, undefined when the voice is unknown. */
export function getQualifiedVoiceGender(voiceId: string): 'male' | 'female' | undefined {
  const gender = HIGGS_QUALIFIED_VOICE_CATALOG.find((voice) => voice.id === voiceId)?.gender;
  if (gender === 'male' || gender === 'female') return gender;
  // tariq and amine are verified fallback voices without a catalog profile yet
  const fallbackVoices: Record<'male' | 'female', readonly string[]> =
    HIGGS_FALLBACK_VOICES_BY_GENDER;
  if (fallbackVoices.male.includes(voiceId)) return 'male';
  if (fallbackVoices.female.includes(voiceId)) return 'female';
  return undefined;
}

export function getQualifiedVoicesForLanguage(
  language: QualifiedVoiceLanguage,
): QualifiedVoiceCatalogEntry[] {
  return HIGGS_QUALIFIED_VOICE_CATALOG.filter((voice) => voice.languages.includes(language));
}

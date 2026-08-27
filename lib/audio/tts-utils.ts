/**
 * Shared TTS utilities used by both client-side and server-side generation.
 */

import type { TTSProviderId } from './types';
import type { Action, SpeechAction } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';
import { splitTextIntoLanguageSegments } from './language-segments';
import { ANGLICISM_TERMS } from './anglicism-dictionary';

const log = createLogger('TTS');

export type SpeechLanguage = 'fr' | 'en' | 'ar';

/** Resolve locale codes and generated language directives to a stable TTS language. */
export function resolveSpeechLanguage(value?: string): SpeechLanguage | undefined {
  const normalized = value?.trim().toLocaleLowerCase('fr-FR');
  if (!normalized) return undefined;
  if (/\b(?:fr(?:[-_]fr)?|français|francais|french)\b/u.test(normalized)) return 'fr';
  if (/\b(?:en(?:[-_]us)?|anglais|english)\b/u.test(normalized)) return 'en';
  if (/\b(?:ar(?:[-_]ma)?|arabe|arabic)\b/u.test(normalized)) return 'ar';
  return undefined;
}

function singularizeFrenchDirhams(match: string): string {
  if (match === match.toLocaleUpperCase('fr-FR')) return 'DIRHAM';
  if (match[0] === match[0]?.toLocaleUpperCase('fr-FR')) return 'Dirham';
  return 'dirham';
}

/**
 * Build the provider-only speech copy without mutating learner-visible text.
 * French plural `dirhams` is written normally on screen, while the TTS receives
 * `dirham` so a provider cannot vocalize the final `s`.
 */
export function prepareTextForTTS(text: string, language?: string): string {
  if (resolveSpeechLanguage(language) !== 'fr') return text;
  return text.replace(/\bdirhams\b/giu, singularizeFrenchDirhams);
}

/** Provider-specific max text length limits. */
export const TTS_MAX_TEXT_LENGTH: Partial<Record<TTSProviderId, number>> = {
  'glm-tts': 1024,
};

/**
 * Split long text into chunks that respect sentence boundaries.
 * Tries splitting at sentence-ending punctuation first, then clause-level
 * punctuation, and finally hard-splits at maxLength as a last resort.
 */
export function splitLongSpeechText(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized || normalized.length <= maxLength) return [normalized];

  const units = normalized
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const appendUnit = (unit: string) => {
    if (!current) {
      current = unit;
      return;
    }
    if ((current + unit).length <= maxLength) {
      current += unit;
      return;
    }
    pushChunk(current);
    current = unit;
  };

  const hardSplitUnit = (unit: string) => {
    const parts = unit.split(/(?<=[，,、])/u).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length <= maxLength) appendUnit(part);
        else hardSplitUnit(part);
      }
      return;
    }

    let start = 0;
    while (start < unit.length) {
      appendUnit(unit.slice(start, start + maxLength));
      start += maxLength;
    }
  };

  for (const unit of units.length > 0 ? units : [normalized]) {
    if (unit.length <= maxLength) appendUnit(unit);
    else hardSplitUnit(unit);
  }

  pushChunk(current);
  return chunks;
}

/** Providers empiriquement confirmés pour accepter un `language` par appel TTS. */
const ANGLICISM_AWARE_PROVIDERS: ReadonlySet<TTSProviderId> = new Set(['higgs-tts']);

/**
 * Split speech actions so each run of consecutive anglicisms (LiteLLM, MIT…)
 * becomes its own sub-action with `ttsLanguageOverride: 'en'`, while the rest
 * stays `'fr'`. One audio file per sub-action — no byte concatenation. Only
 * applies to providers in ANGLICISM_AWARE_PROVIDERS (empirically verified).
 */
export function splitSpeechActionsByAnglicisms(
  actions: Action[],
  providerId: TTSProviderId,
): Action[] {
  if (!ANGLICISM_AWARE_PROVIDERS.has(providerId)) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text) return [action];

    const segments = splitTextIntoLanguageSegments(action.text, ANGLICISM_TERMS);
    if (segments.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech by language for ${providerId}: action=${action.id}, segments=${segments.length}`,
    );
    return segments.map((segment, i) => ({
      ...baseAction,
      id: `${action.id}_lang_${i + 1}`,
      text: segment.text,
      ttsLanguageOverride: segment.language,
    }));
  });
  return didSplit ? nextActions : actions;
}

/**
 * Split long speech actions into multiple shorter actions so each stays
 * within the TTS provider's text length limit. Each sub-action gets its
 * own independent audio file — no byte concatenation needed.
 */
export function splitLongSpeechActions(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  if (!maxLength) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text || action.text.length <= maxLength)
      return [action];

    const chunks = splitLongSpeechText(action.text, maxLength);
    if (chunks.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech for ${providerId}: action=${action.id}, len=${action.text.length}, chunks=${chunks.length}`,
    );
    return chunks.map((chunk, i) => ({
      ...baseAction,
      id: `${action.id}_tts_${i + 1}`,
      text: chunk,
    }));
  });
  return didSplit ? nextActions : actions;
}

export interface LanguageSegment {
  text: string;
  language: 'fr' | 'en';
}

/**
 * Split text into runs of consecutive French/anglicism tokens, using a
 * whole-word (case-sensitive) match against `dictionary`. Consecutive
 * anglicism matches merge into a single `en` segment to minimize the
 * number of TTS sub-actions/audio files produced downstream.
 */
export function splitTextIntoLanguageSegments(
  text: string,
  dictionary: readonly string[] = [],
): LanguageSegment[] {
  const normalized = text.trim();
  if (!normalized || dictionary.length === 0) {
    return [{ text: normalized, language: 'fr' }];
  }

  const escaped = dictionary
    .slice()
    .sort((a, b) => b.length - a.length) // longest-first avoids partial shadowing
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');

  const segments: LanguageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingEnWords: string[] = [];

  const flushFr = (end: number) => {
    const chunk = normalized.slice(lastIndex, end).trim();
    if (chunk) segments.push({ text: chunk, language: 'fr' });
  };
  const flushEn = () => {
    if (pendingEnWords.length > 0) {
      segments.push({ text: pendingEnWords.join(' '), language: 'en' });
      pendingEnWords = [];
    }
  };

  while ((match = pattern.exec(normalized)) !== null) {
    const gapBefore = normalized.slice(lastIndex, match.index);
    if (gapBefore.trim()) {
      flushEn();
      flushFr(match.index);
    }
    pendingEnWords.push(match[0]);
    lastIndex = pattern.lastIndex;
  }
  flushEn();
  flushFr(normalized.length);

  const merged: LanguageSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!/[\p{L}\p{N}]/u.test(segment.text)) {
      const previous = merged.at(-1);
      if (previous) previous.text += segment.text;
      else if (segments[index + 1])
        segments[index + 1].text = segment.text + segments[index + 1].text;
      continue;
    }

    const previous = merged.at(-1);
    if (previous?.language === segment.language) previous.text += ` ${segment.text}`;
    else merged.push({ ...segment });
  }

  return merged.length > 0 ? merged : [{ text: normalized, language: 'fr' }];
}

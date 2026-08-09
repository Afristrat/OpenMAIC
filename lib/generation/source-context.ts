import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';

const OMISSION_MARKER = '\n\n[... sections omitted for context budget ...]\n\n';

/** Preserve evidence from the beginning, middle and end of a long source. */
export function selectSourceContext(text: string, maxChars = MAX_PDF_CONTENT_CHARS): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;

  const available = Math.max(3, maxChars - OMISSION_MARKER.length * 2);
  const firstLength = Math.ceil(available * 0.4);
  const middleLength = Math.floor(available * 0.3);
  const lastLength = available - firstLength - middleLength;
  const middleStart = Math.max(0, Math.floor((normalized.length - middleLength) / 2));

  return [
    normalized.slice(0, firstLength),
    normalized.slice(middleStart, middleStart + middleLength),
    normalized.slice(-lastLength),
  ].join(OMISSION_MARKER);
}

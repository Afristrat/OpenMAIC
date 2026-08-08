const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function shouldUseOcrFallback(text: string): boolean {
  const compact = text.trim();
  if (!compact) return true;

  const controlCharacters = compact.match(CONTROL_CHARACTER_PATTERN)?.length ?? 0;
  return controlCharacters / compact.length >= 0.08;
}

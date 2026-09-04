export function normalizeWhatsAppNumber(value: string): string | null {
  const normalized = value.replace(/[\s.()-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

/**
 * Format marketplace timestamps as a stable UTC calendar date.
 *
 * Marketplace pages are server-rendered before hydration. Relying on the
 * runtime locale or timezone makes the server and browser emit different
 * text for the same timestamp, which breaks React hydration.
 */
export function formatMarketplaceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

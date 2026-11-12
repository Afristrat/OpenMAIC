/** Formats et taille des logos téléversés : partagés par les routes serveur et les formulaires (sans dépendance serveur). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

export function isAcceptedLogoType(type: string): boolean {
  return (LOGO_ACCEPTED_TYPES as readonly string[]).includes(type);
}

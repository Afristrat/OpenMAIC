/**
 * Liste blanche des types de contenu que /api/proxy-media accepte de relayer.
 *
 * Le proxy sert deux usages : le téléchargement de médias générés (images, vidéos,
 * audios) et l'inlining d'assets à l'export HTML (feuilles de style, scripts, polices,
 * SVG). Tout ce qui est interprétable comme document par un navigateur (text/html,
 * application/xhtml+xml, application/xml, text/xml) est refusé : c'est le vecteur de
 * XSS réfléchi. Le SVG est toléré, car la réponse porte `Content-Security-Policy: sandbox`.
 */

const ALLOWED_EXACT = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'video/mp4',
  'video/webm',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-fontobject',
  'application/x-font-ttf',
  'application/x-font-opentype',
]);

const ALLOWED_PREFIXES = ['audio/', 'font/'];

/** Type déduit du suffixe de l'URL quand l'amont répond application/octet-stream. */
const EXTENSION_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function isAllowed(type: string): boolean {
  return ALLOWED_EXACT.has(type) || ALLOWED_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function extensionOf(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop() ?? '';
    return last.includes('.') ? (last.split('.').pop() ?? '').toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Renvoie le type nettoyé (sans paramètres) à relayer, ou `null` si le type amont
 * n'est pas autorisé. Un type absent ou `application/octet-stream` est déduit du
 * suffixe de l'URL ; sans suffixe connu, il est refusé.
 */
export function resolveProxyContentType(header: string | null, url: string): string | null {
  const type = (header ?? '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/octet-stream') return isAllowed(type) ? type : null;
  return EXTENSION_TYPES[extensionOf(url)] ?? null;
}

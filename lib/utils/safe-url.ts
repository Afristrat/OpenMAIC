/**
 * Renvoie l'URL telle quelle si c'est une URL absolue http(s), sinon undefined. À appliquer à
 * tout `href` alimenté par des données de classroom : `javascript:`, `data:` et `vbscript:`
 * s'exécuteraient au clic (XSS stocké).
 */
export function safeHttpUrl(value: unknown): string | undefined {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined;
}

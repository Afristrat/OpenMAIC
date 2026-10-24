import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = join(process.cwd(), 'app', 'api');

/** Importe une fonction qui consomme des crédits (LLM, voix, médias, recherche web). */
const CONSUMPTION_IMPORT =
  /from\s+'@\/lib\/(ai\/llm|audio\/(tts|asr)-providers|media\/(image|video)-providers|server\/metered-media-providers|server\/classroom-media-generation|orchestration\/stateless-generate|web-search)'/;

/** Une route de consommation doit traduire un solde insuffisant en 402 stable ou en évènement SSE codé. */
const CREDIT_HANDLING =
  /creditsErrorResponse|insufficientCreditsResponse|llmApiError|INSUFFICIENT_CREDITS/;

/**
 * Routes qui consomment sans pouvoir répondre 402 elles-mêmes, avec la raison.
 */
const EXEMPT: Record<string, string> = {
  'app/api/verify-image-provider/route.ts': 'test de connectivité, aucun appel mesuré',
  'app/api/verify-video-provider/route.ts': 'test de connectivité, aucun appel mesuré',
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === 'route.ts' ? [path] : [];
  });
}

describe('routes de consommation de crédits', () => {
  const consuming = routeFiles(API_ROOT)
    .map((file) => ({
      name: relative(process.cwd(), file).split(sep).join('/'),
      source: readFileSync(file, 'utf8'),
    }))
    .filter(({ source }) => CONSUMPTION_IMPORT.test(source));

  it('détecte bien les routes de consommation', () => {
    expect(consuming.length).toBeGreaterThanOrEqual(20);
  });

  it.each(consuming.map(({ name, source }) => [name, source] as const))(
    '%s traduit un solde insuffisant (402 INSUFFICIENT_CREDITS)',
    (name, source) => {
      if (EXEMPT[name]) return;
      expect(source).toMatch(CREDIT_HANDLING);
    },
  );
});

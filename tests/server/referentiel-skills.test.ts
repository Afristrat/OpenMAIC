import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readReferentielSkills } from '@/lib/server/referentiel-skills';

type Batch = string[];

/** Faux client : enregistre chaque lot demandé et répond une ligne par URI, ou une erreur au lot choisi. */
function fakeClient(batches: Batch[], failAt?: number): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: (_column: string, uris: Batch) => ({
          returns: async () => {
            batches.push(uris);
            if (failAt === batches.length) return { data: null, error: { message: 'boom' } };
            return {
              data: uris.map((uri) => ({ uri, title_fr: uri, title_ar: null, title_en: null })),
              error: null,
            };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient; // faux client minimal : seule la chaîne from/select/in/returns est utilisée
}

describe('readReferentielSkills', () => {
  it('lit les compétences par lots bornés et rend toutes les lignes', async () => {
    const batches: Batch[] = [];
    const uris = Array.from({ length: 130 }, (_, index) => `skill-${index}`);
    const { data, error } = await readReferentielSkills(fakeClient(batches), uris);
    expect(error).toBeNull();
    expect(data).toHaveLength(130);
    expect(Math.max(...batches.map((batch) => batch.length))).toBeLessThanOrEqual(40);
    expect(batches.flat()).toEqual(uris);
  });

  it('ne lit rien pour une liste vide', async () => {
    const batches: Batch[] = [];
    const { data, error } = await readReferentielSkills(fakeClient(batches), []);
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(batches).toHaveLength(0);
  });

  it("rend l'erreur du premier lot qui échoue", async () => {
    const batches: Batch[] = [];
    const uris = Array.from({ length: 100 }, (_, index) => `skill-${index}`);
    const { data, error } = await readReferentielSkills(fakeClient(batches, 2), uris);
    expect(error?.message).toBe('boom');
    expect(data).toEqual([]);
  });
});

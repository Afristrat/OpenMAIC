import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Au-delà de quelques dizaines d'URI, le filtre `in` allonge l'adresse de la requête jusqu'au rejet
 * par la passerelle : un métier ESCO peut porter plus de cent compétences, on lit donc par lots.
 */
const SKILL_BATCH_SIZE = 40;

export type ReferentielSkillRow = {
  uri: string;
  title_fr: string;
  title_ar: string | null;
  title_en: string | null;
};

/** Titres des compétences du miroir pour une liste d'URI, quelle qu'en soit la taille. */
export async function readReferentielSkills(
  supabase: SupabaseClient,
  uris: string[],
): Promise<{ data: ReferentielSkillRow[]; error: { message: string } | null }> {
  const rows: ReferentielSkillRow[] = [];
  for (let start = 0; start < uris.length; start += SKILL_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('referentiel_skills')
      .select('uri, title_fr, title_ar, title_en')
      .in('uri', uris.slice(start, start + SKILL_BATCH_SIZE))
      .returns<ReferentielSkillRow[]>();
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

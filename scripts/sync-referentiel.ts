// Recopie les métiers et compétences du référentiel commun (OpenSALT) dans le miroir de lecture de Qalem.
// Usage : pnpm exec tsx scripts/sync-referentiel.ts
// Variables : QALEM_SUPABASE_SERVICE_ROLE_KEY (obligatoire), QALEM_SUPABASE_URL, REFERENTIEL_URL (facultatives).
import { createClient } from '@supabase/supabase-js';
import { fetchCaseDocuments, fetchCasePackage } from '../lib/referentiel/case-client';
import { mirrorRows, type OccupationRow, type SkillRow } from '../lib/referentiel/mirror';

const REFERENTIEL_URL = process.env.REFERENTIEL_URL ?? 'https://referentiel.ai-mpower.com';
const SUPABASE_URL = process.env.QALEM_SUPABASE_URL ?? 'https://db.qalem.ma';
const KEY = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const BATCH = 500;

if (!KEY) throw new Error('QALEM_SUPABASE_SERVICE_ROLE_KEY est requise');
const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

async function upsertAll<Row extends object>(table: string, rows: Row[], startedAt: string) {
  for (let from = 0; from < rows.length; from += BATCH) {
    const chunk = rows.slice(from, from + BATCH).map((row) => ({ ...row, synced_at: startedAt }));
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'uri' });
    if (error) throw new Error(`${table} : ${error.message}`);
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const documents = await fetchCaseDocuments(REFERENTIEL_URL);
  const occupations = new Map<string, OccupationRow>();
  const skills = new Map<string, SkillRow>();
  for (const document of documents) {
    const rows = mirrorRows(await fetchCasePackage(REFERENTIEL_URL, document.identifier));
    for (const row of rows.occupations) occupations.set(row.uri, row);
    for (const row of rows.skills) skills.set(row.uri, row);
    console.log(`${document.title} : ${rows.occupations.length} métiers`);
  }
  if (occupations.size === 0) throw new Error('Aucun métier lu : le miroir reste inchangé');

  await upsertAll('referentiel_skills', [...skills.values()], startedAt);
  await upsertAll('referentiel_occupations', [...occupations.values()], startedAt);
  // Ce qui n'a pas été revu dans cette passe n'existe plus dans le référentiel : on le retire.
  for (const table of ['referentiel_occupations', 'referentiel_skills']) {
    const { error } = await supabase.from(table).delete().lt('synced_at', startedAt);
    if (error) throw new Error(`${table} (purge) : ${error.message}`);
  }
  console.log(`Miroir à jour : ${occupations.size} métiers, ${skills.size} compétences`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

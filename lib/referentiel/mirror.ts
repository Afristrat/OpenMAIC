import {
  competenciesOfOccupation,
  listOccupationUris,
  type CasePackage,
  type Competence,
  type Titles,
} from './case-client';

/** Lignes des tables `referentiel_occupations` et `referentiel_skills`, telles que la base les attend. */
export type OccupationRow = {
  uri: string;
  title_fr: string;
  title_ar: string | null;
  title_en: string | null;
  isco_code: string | null;
  document_id: string;
  referentiel_version: string;
  essential_uris: string[];
  optional_uris: string[];
  search_text: string;
};

export type SkillRow = {
  uri: string;
  title_fr: string;
  title_ar: string | null;
  title_en: string | null;
  search_text: string;
};

/** Minuscules, sans accents ni signes diacritiques : la même forme sert à indexer et à chercher. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchText(titles: Titles): string {
  return normalizeSearch([titles.fr, titles.ar, titles.en].filter(Boolean).join(' '));
}

function skillRow(competence: Competence): SkillRow {
  return {
    uri: competence.competenceUri,
    title_fr: competence.titles.fr,
    title_ar: competence.titles.ar,
    title_en: competence.titles.en,
    search_text: searchText(competence.titles),
  };
}

/** Métiers et compétences d'un document du référentiel, prêts à être écrits dans le miroir. */
export function mirrorRows(source: CasePackage): {
  occupations: OccupationRow[];
  skills: SkillRow[];
} {
  const occupations: OccupationRow[] = [];
  const skills = new Map<string, SkillRow>();
  for (const uri of listOccupationUris(source)) {
    const found = competenciesOfOccupation(source, uri);
    if (!found) continue;
    for (const competence of [...found.essential, ...found.optional]) {
      skills.set(competence.competenceUri, skillRow(competence));
    }
    occupations.push({
      uri,
      title_fr: found.occupation.titles.fr,
      title_ar: found.occupation.titles.ar,
      title_en: found.occupation.titles.en,
      isco_code: found.occupation.iscoCode,
      document_id: source.CFDocument.identifier,
      referentiel_version: found.occupation.referentielVersion,
      essential_uris: found.essential.map((competence) => competence.competenceUri),
      optional_uris: found.optional.map((competence) => competence.competenceUri),
      search_text: searchText(found.occupation.titles),
    });
  }
  return { occupations, skills: [...skills.values()] };
}

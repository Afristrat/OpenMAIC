import type { Competence, OccupationCompetencies } from './case-client';

/** Part des compétences d'un métier visées par une formation, essentielles d'un côté, optionnelles de l'autre. */
export type CoverageBucket = {
  total: number;
  covered: number;
  /** Entre 0 et 1 ; 0 quand le métier n'a aucune compétence de cette nature. */
  ratio: number;
  missing: Competence[];
};

export type OccupationCoverage = {
  occupation: OccupationCompetencies['occupation'];
  essential: CoverageBucket;
  optional: CoverageBucket;
};

function bucket(competences: Competence[], linked: ReadonlySet<string>): CoverageBucket {
  const missing = competences.filter(
    (competence) =>
      !linked.has(competence.competenceUri) &&
      (competence.escoUri === null || !linked.has(competence.escoUri)),
  );
  const covered = competences.length - missing.length;
  return {
    total: competences.length,
    covered,
    ratio: competences.length === 0 ? 0 : covered / competences.length,
    missing,
  };
}

/** Une compétence est couverte quand la formation porte un lien vers son URI (ESCO, ou CASE hors ESCO). */
export function computeOccupationCoverage(
  source: OccupationCompetencies,
  linkedUris: readonly string[],
): OccupationCoverage {
  const linked = new Set(linkedUris);
  return {
    occupation: source.occupation,
    essential: bucket(source.essential, linked),
    optional: bucket(source.optional, linked),
  };
}

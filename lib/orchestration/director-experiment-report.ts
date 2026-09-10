import { z } from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const language = z.enum(['fr-FR', 'ar-MA', 'en-US']);
export const directorExperimentRows = z
  .array(
    z
      .object({
        cohort: z.enum(['classic', 'data-driven']),
        language: language.nullable(),
        assignedUnits: count,
        unitsWithQuiz: count,
        missingQuizUnits: count,
        meanQuizScore: z.number().min(0).max(1).nullable(),
        unitsWithReportedTurns: count,
        decisions: count,
        selections: count,
        suggestionSelections: count,
        changedSelections: count,
        completedGenerations: count,
        failedGenerations: count,
        emptyGenerations: count,
        abortedGenerations: count,
        pendingGenerations: count,
        linkedTurns: count,
        meanLookupMs: z.number().nonnegative().max(86400000).nullable(),
      })
      .strict()
      .refine(
        (r) =>
          r.unitsWithQuiz + r.missingQuizUnits === r.assignedUnits &&
          r.unitsWithReportedTurns <= r.assignedUnits &&
          r.unitsWithQuiz <= r.assignedUnits &&
          (r.meanQuizScore === null) === (r.unitsWithQuiz === 0) &&
          r.selections <= r.decisions &&
          r.changedSelections <= r.suggestionSelections &&
          r.suggestionSelections <= r.selections &&
          r.linkedTurns <= r.decisions &&
          r.completedGenerations +
            r.failedGenerations +
            r.emptyGenerations +
            r.abortedGenerations +
            r.pendingGenerations ===
            r.decisions,
      ),
  )
  .max(8)
  .refine((rows) => new Set(rows.map((r) => `${r.cohort}:${r.language}`)).size === rows.length);

/** Descriptive differences only; no missing score is silently imputed as zero. */
export function buildDirectorExperimentReport(input: unknown) {
  const cohorts = directorExperimentRows.parse(input);
  return {
    experiment: 'qalem-director-v1' as const,
    unit: 'learner-organization-classroom' as const,
    outcome: 'first-submitted-linked-native-quiz' as const,
    evidence: 'observational' as const,
    cohorts,
    comparisons: language.options.map((locale) => {
      const classic = cohorts.find((r) => r.language === locale && r.cohort === 'classic');
      const treatment = cohorts.find((r) => r.language === locale && r.cohort === 'data-driven');
      return {
        language: locale,
        meanScoreDifference:
          classic?.meanQuizScore != null && treatment?.meanQuizScore != null
            ? treatment.meanQuizScore - classic.meanQuizScore
            : null,
      };
    }),
  };
}

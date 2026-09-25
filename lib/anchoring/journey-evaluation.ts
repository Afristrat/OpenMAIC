import { z } from 'zod';

const rating = z.number().int().min(1).max(5);
const declined = z.object({ declined: z.literal(true) }).strict();

export const hotJourneyEvaluationSchema = z.union([
  declined,
  z.object({ relevance: rating, returnIntent: rating }).strict(),
  z.object({ useful: rating, confidence: rating }).strict(),
]);

export const coldJourneyEvaluationSchema = z.union([
  declined,
  z.object({ relevance: rating, returnIntent: rating, application: rating }).strict(),
  z.object({ useful: rating, confidence: rating }).strict(),
]);

type JourneyEvaluation =
  | z.infer<typeof hotJourneyEvaluationSchema>
  | z.infer<typeof coldJourneyEvaluationSchema>;

export function normalizeJourneyEvaluation(value: JourneyEvaluation): {
  answers: Record<string, number | boolean>;
  score: number | null;
} {
  if ('declined' in value) return { answers: { declined: true }, score: null };
  if ('useful' in value) {
    return {
      answers: value,
      score: ((value.useful + value.confidence) / 10) * 100,
    };
  }
  const ratings = [value.relevance, value.returnIntent];
  if ('application' in value) ratings.push(value.application);
  return {
    answers: {
      relevance: value.relevance,
      return_intent: value.returnIntent,
      ...('application' in value ? { application: value.application } : {}),
    },
    score:
      Math.round(
        (ratings.reduce((total, current) => total + current, 0) / (ratings.length * 5)) * 10_000,
      ) / 100,
  };
}

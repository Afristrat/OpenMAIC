import { z } from 'zod';

// Display metadata only: never use a browser-returned report as optimization input.
export const optimizationReportSchema = z
  .object({
    recommendedSceneOrder: z
      .array(z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']))
      .min(1)
      .max(256),
    difficultyModifier: z.number().min(-0.2).max(0.2),
    sampleSize: z.number().int().min(1).max(1000),
    selectedSequenceSampleSize: z.number().int().min(1).max(1000),
    observedMeanQuizScore: z.number().min(0).max(1),
    selectedSequenceMeanQuizScore: z.number().min(0).max(1),
    evidence: z.literal('observational'),
    observationWindowLimit: z.literal(1000),
  })
  .refine((report) => report.selectedSequenceSampleSize <= report.sampleSize);

export type OptimizationReport = z.infer<typeof optimizationReportSchema>;

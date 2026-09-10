import { describe, expect, it } from 'vitest';
import { optimizationReportSchema } from '@/lib/generation/optimization-report';

const report = {
  recommendedSceneOrder: ['slide', 'quiz'],
  difficultyModifier: -0.2,
  sampleSize: 1,
  selectedSequenceSampleSize: 1,
  observedMeanQuizScore: 0.4,
  selectedSequenceMeanQuizScore: 0.4,
  evidence: 'observational',
  observationWindowLimit: 1000,
};

describe('display-only optimization report', () => {
  it('accepts one observation without a confidence claim', () => {
    expect(optimizationReportSchema.parse({ ...report, confidence: 1 })).toEqual(report);
  });
  it('rejects impossible counts, invalid measures and unknown scene types', () => {
    for (const patch of [
      { sampleSize: 0 },
      { selectedSequenceSampleSize: 2 },
      { observedMeanQuizScore: NaN },
      { difficultyModifier: 0.3 },
      { recommendedSceneOrder: ['untrusted instruction'] },
    ]) {
      expect(optimizationReportSchema.safeParse({ ...report, ...patch }).success).toBe(false);
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  canUseForTask,
  createReferencedCertification,
  recordCapabilityProbe,
  recordTaskValidation,
} from '@/lib/ai/capability-registry';
import {
  evaluateTaskPromotion,
  type PromotionPolicy,
  type TaskEvaluationRun,
} from '@/lib/formation-engine/evaluation-promotion';

const policy: PromotionPolicy = {
  id: 'outline-quality-v1',
  status: 'approved',
  approvedAt: '2026-07-20T00:00:00.000Z',
  approvalRef: 'approval:test-fixture:outline-v1',
  taskId: 'outline',
  capability: 'reasoning',
  goldenCaseIds: ['case-fr', 'case-ar'],
  requiredDeterministicCheckIds: ['schema', 'source-links'],
  requiredLocales: ['fr-FR', 'ar-MA'],
  minimumJudgeScore: 0.8,
  minimumLanguageScore: 0.75,
  judgeRubricVersion: 'outline-rubric-v1',
  minimumCalibrationSamples: 20,
  minimumJudgeAgreement: 0.85,
  maximumJudgeFalsePositiveRate: 0.1,
  requireIndependentJudge: true,
  minimumHumanReviews: 1,
  maximumHumanFailureRate: 0,
};

function evaluationRun(): TaskEvaluationRun {
  return {
    runId: 'run-outline-kimi-v1',
    modelId: 'kimi-k2.6',
    taskId: 'outline',
    capability: 'reasoning',
    completedAt: '2026-07-21T21:00:00.000Z',
    evidenceRef: 'eval-run:sha256:outline-kimi-v1',
    calibration: {
      judgeId: 'independent-judge',
      rubricVersion: 'outline-rubric-v1',
      sampleSize: 40,
      agreement: 0.9,
      falsePositiveRate: 0.05,
      calibratedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      evidenceRef: 'judge-calibration:sha256:outline-v1',
    },
    cases: [
      {
        caseId: 'case-fr',
        locale: 'fr-FR',
        artifactRef: 'artifact:case-fr:v1',
        deterministicChecks: [
          { checkId: 'schema', passed: true, evidenceRef: 'check:case-fr:schema' },
          { checkId: 'source-links', passed: true, evidenceRef: 'check:case-fr:sources' },
        ],
        judge: { judgeId: 'independent-judge', score: 0.88, evidenceRef: 'judge:case-fr' },
        languageScore: 0.92,
      },
      {
        caseId: 'case-ar',
        locale: 'ar-MA',
        artifactRef: 'artifact:case-ar:v1',
        deterministicChecks: [
          { checkId: 'schema', passed: true, evidenceRef: 'check:case-ar:schema' },
          { checkId: 'source-links', passed: true, evidenceRef: 'check:case-ar:sources' },
        ],
        judge: { judgeId: 'independent-judge', score: 0.86, evidenceRef: 'judge:case-ar' },
        languageScore: 0.84,
      },
    ],
    humanReviews: [
      {
        caseId: 'case-ar',
        reviewerRef: 'reviewer:pedagogy-01',
        outcome: 'passed',
        reviewedAt: '2026-07-21T20:55:00.000Z',
        evidenceRef: 'human-review:case-ar:v1',
      },
    ],
  };
}

describe('task evaluation promotion gate', () => {
  it('keeps the candidate policy aligned with its external golden set', () => {
    const goldenSet = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'eval/formation-engine/promotion/golden-sets/outline-core-v1.json'),
        'utf8',
      ),
    ) as { status: string; cases: Array<{ id: string }> };
    const candidate = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'eval/formation-engine/promotion/policies/outline-core-v1.candidate.json',
        ),
        'utf8',
      ),
    ) as { status: string; policy: PromotionPolicy };

    expect(candidate.status).toBe('candidate');
    expect(candidate.policy.goldenCaseIds).toEqual(goldenSet.cases.map((item) => item.id));
    expect(() => evaluateTaskPromotion(candidate.policy, evaluationRun())).toThrow(
      'Promotion policy is not approved',
    );
  });

  it('promotes only after deterministic, calibrated-judge and human gates pass', () => {
    const decision = evaluateTaskPromotion(policy, evaluationRun());
    const referenced = createReferencedCertification(
      {
        model_name: 'kimi-k2.6',
        litellm_params: { model: 'moonshot/kimi-k2.6' },
        model_info: { mode: 'chat', supports_reasoning: true },
      },
      { observedAt: '2026-07-21T20:00:00.000Z', evidenceRef: 'inventory:v1' },
    );
    const reachable = recordCapabilityProbe(referenced, {
      modelId: 'kimi-k2.6',
      capability: 'reasoning',
      outcome: 'passed',
      probedAt: '2026-07-21T20:05:00.000Z',
      evidenceRef: 'probe:reasoning:v1',
      latencyMs: 250,
      limitations: [],
    });
    const certified = recordTaskValidation(reachable, decision.validation);

    expect(decision).toMatchObject({ outcome: 'passed', reasons: [] });
    expect(decision.validation.promotion).toMatchObject({
      policyId: 'outline-quality-v1',
      runId: 'run-outline-kimi-v1',
      decision: 'passed',
    });
    expect(canUseForTask(certified, 'reasoning', 'outline', 'fr-FR')).toBe(true);
    expect(canUseForTask(certified, 'reasoning', 'outline', 'ar-MA')).toBe(true);
  });

  it('fails when a required deterministic check fails', () => {
    const run = evaluationRun();
    run.cases[0].deterministicChecks[0].passed = false;

    expect(evaluateTaskPromotion(policy, run)).toMatchObject({
      outcome: 'failed',
      reasons: ['deterministic-check-failed:case-fr:schema'],
    });
  });

  it('fails when the judge calibration is weak, expired or self-judging', () => {
    const run = evaluationRun();
    run.calibration.agreement = 0.6;
    run.calibration.falsePositiveRate = 0.3;
    run.calibration.expiresAt = '2026-07-20T00:00:00.000Z';
    run.calibration.judgeId = run.modelId;
    for (const result of run.cases) result.judge.judgeId = run.modelId;

    expect(evaluateTaskPromotion(policy, run).reasons).toEqual(
      expect.arrayContaining([
        'judge-calibration-agreement-too-low',
        'judge-calibration-false-positive-rate-too-high',
        'judge-calibration-not-current',
        'judge-not-independent',
      ]),
    );
  });

  it('fails when the human sample is absent or rejects an output', () => {
    const absent = evaluationRun();
    absent.humanReviews = [];
    expect(evaluateTaskPromotion(policy, absent).reasons).toContain('human-sample-too-small');

    const rejected = evaluationRun();
    rejected.humanReviews[0].outcome = 'failed';
    expect(evaluateTaskPromotion(policy, rejected).reasons).toContain(
      'human-failure-rate-too-high',
    );
  });

  it('fails when a required language lacks coverage or quality', () => {
    const run = evaluationRun();
    run.cases[1].locale = 'en-US';

    expect(evaluateTaskPromotion(policy, run).reasons).toContain('locale-not-covered:ar-MA');
  });

  it('fails when a golden case or required judge score is missing', () => {
    const missing = evaluationRun();
    missing.cases = missing.cases.filter((result) => result.caseId !== 'case-ar');
    missing.humanReviews = [
      {
        caseId: 'case-fr',
        reviewerRef: 'reviewer:pedagogy-01',
        outcome: 'passed',
        reviewedAt: '2026-07-21T20:55:00.000Z',
        evidenceRef: 'human-review:case-fr:v1',
      },
    ];
    expect(evaluateTaskPromotion(policy, missing).reasons).toContain('golden-case-missing:case-ar');

    const weak = evaluationRun();
    weak.cases[0].judge.score = 0.5;
    expect(evaluateTaskPromotion(policy, weak).reasons).toContain('judge-score-too-low:case-fr');
  });

  it('rejects a policy that attempts to omit human review', () => {
    expect(() =>
      evaluateTaskPromotion({ ...policy, minimumHumanReviews: 0 }, evaluationRun()),
    ).toThrow('Minimum human reviews must be a positive integer');
  });

  it('rejects a candidate policy even when its numeric thresholds pass', () => {
    expect(() =>
      evaluateTaskPromotion({ ...policy, status: 'candidate' }, evaluationRun()),
    ).toThrow('Promotion policy is not approved');
  });
});

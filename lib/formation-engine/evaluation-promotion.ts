import type { QalemCapability, TaskValidationResult } from '@/lib/ai/capability-registry';

export interface PromotionPolicy {
  id: string;
  status: 'candidate' | 'approved' | 'retired';
  approvedAt: string | null;
  approvalRef: string | null;
  taskId: string;
  capability: QalemCapability;
  goldenCaseIds: string[];
  requiredDeterministicCheckIds: string[];
  requiredLocales: string[];
  minimumJudgeScore: number;
  minimumLanguageScore: number;
  judgeRubricVersion: string;
  minimumCalibrationSamples: number;
  minimumJudgeAgreement: number;
  maximumJudgeFalsePositiveRate: number;
  requireIndependentJudge: boolean;
  minimumHumanReviews: number;
  maximumHumanFailureRate: number;
}

export interface JudgeCalibration {
  judgeId: string;
  rubricVersion: string;
  sampleSize: number;
  agreement: number;
  falsePositiveRate: number;
  calibratedAt: string;
  expiresAt: string;
  evidenceRef: string;
}

export interface DeterministicCheckResult {
  checkId: string;
  passed: boolean;
  evidenceRef: string;
}

export interface JudgeCaseResult {
  judgeId: string;
  score: number;
  evidenceRef: string;
}

export interface PromotionCaseResult {
  caseId: string;
  locale: string | null;
  artifactRef: string;
  deterministicChecks: DeterministicCheckResult[];
  judge: JudgeCaseResult;
  languageScore: number | null;
}

export interface HumanReviewResult {
  caseId: string;
  reviewerRef: string;
  outcome: 'passed' | 'failed';
  reviewedAt: string;
  evidenceRef: string;
}

export interface TaskEvaluationRun {
  runId: string;
  modelId: string;
  taskId: string;
  capability: QalemCapability;
  completedAt: string;
  evidenceRef: string;
  calibration: JudgeCalibration;
  cases: PromotionCaseResult[];
  humanReviews: HumanReviewResult[];
}

export interface PromotionDecision {
  outcome: 'passed' | 'failed';
  reasons: string[];
  validation: TaskValidationResult;
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function requireDate(value: string, label: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid`);
}

function requireRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
}

function requireUniqueNonEmpty(values: string[], label: string): void {
  if (values.some((value) => !value.trim())) throw new Error(`${label} contains an empty value`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function validatePolicy(policy: PromotionPolicy): void {
  requireText(policy.id, 'Promotion policy id');
  if (policy.status !== 'approved') throw new Error('Promotion policy is not approved');
  if (!policy.approvedAt || !policy.approvalRef) {
    throw new Error('Approved promotion policy requires approval evidence');
  }
  requireDate(policy.approvedAt, 'Promotion policy approval date');
  requireText(policy.approvalRef, 'Promotion policy approval evidence');
  requireText(policy.taskId, 'Promotion task id');
  requireText(policy.judgeRubricVersion, 'Judge rubric version');
  requireUniqueNonEmpty(policy.goldenCaseIds, 'Golden case ids');
  requireUniqueNonEmpty(policy.requiredDeterministicCheckIds, 'Required deterministic check ids');
  requireUniqueNonEmpty(policy.requiredLocales, 'Required locales');
  if (policy.goldenCaseIds.length === 0)
    throw new Error('A promotion policy requires golden cases');
  if (policy.requiredDeterministicCheckIds.length === 0) {
    throw new Error('A promotion policy requires deterministic checks');
  }
  if (!Number.isInteger(policy.minimumCalibrationSamples) || policy.minimumCalibrationSamples < 1) {
    throw new Error('Minimum calibration samples must be a positive integer');
  }
  if (!Number.isInteger(policy.minimumHumanReviews) || policy.minimumHumanReviews < 1) {
    throw new Error('Minimum human reviews must be a positive integer');
  }
  if (policy.minimumHumanReviews > policy.goldenCaseIds.length) {
    throw new Error('Minimum human reviews cannot exceed the golden set size');
  }
  requireRate(policy.minimumJudgeScore, 'Minimum judge score');
  requireRate(policy.minimumLanguageScore, 'Minimum language score');
  requireRate(policy.minimumJudgeAgreement, 'Minimum judge agreement');
  requireRate(policy.maximumJudgeFalsePositiveRate, 'Maximum judge false-positive rate');
  requireRate(policy.maximumHumanFailureRate, 'Maximum human failure rate');
}

function validateCalibration(
  policy: PromotionPolicy,
  run: TaskEvaluationRun,
  reasons: string[],
): void {
  const { calibration } = run;
  requireText(calibration.judgeId, 'Judge id');
  requireText(calibration.evidenceRef, 'Judge calibration evidence');
  requireDate(calibration.calibratedAt, 'Judge calibration date');
  requireDate(calibration.expiresAt, 'Judge calibration expiry');
  requireRate(calibration.agreement, 'Judge agreement');
  requireRate(calibration.falsePositiveRate, 'Judge false-positive rate');
  if (!Number.isInteger(calibration.sampleSize) || calibration.sampleSize < 1) {
    throw new Error('Judge calibration sample size must be a positive integer');
  }
  if (Date.parse(calibration.expiresAt) < Date.parse(calibration.calibratedAt)) {
    throw new Error('Judge calibration expiry cannot predate calibration');
  }
  if (calibration.rubricVersion !== policy.judgeRubricVersion) {
    reasons.push('judge-rubric-version-mismatch');
  }
  if (calibration.sampleSize < policy.minimumCalibrationSamples) {
    reasons.push('judge-calibration-sample-too-small');
  }
  if (calibration.agreement < policy.minimumJudgeAgreement) {
    reasons.push('judge-calibration-agreement-too-low');
  }
  if (calibration.falsePositiveRate > policy.maximumJudgeFalsePositiveRate) {
    reasons.push('judge-calibration-false-positive-rate-too-high');
  }
  const completedAt = Date.parse(run.completedAt);
  if (
    Date.parse(calibration.calibratedAt) > completedAt ||
    Date.parse(calibration.expiresAt) < completedAt
  ) {
    reasons.push('judge-calibration-not-current');
  }
  if (policy.requireIndependentJudge && calibration.judgeId === run.modelId) {
    reasons.push('judge-not-independent');
  }
}

function validateCases(
  policy: PromotionPolicy,
  run: TaskEvaluationRun,
  reasons: string[],
): PromotionCaseResult[] {
  const casesById = new Map<string, PromotionCaseResult>();
  for (const result of run.cases) {
    requireText(result.caseId, 'Evaluation case id');
    requireText(result.artifactRef, 'Evaluation artifact reference');
    if (result.locale !== null) requireText(result.locale, 'Evaluation case locale');
    if (casesById.has(result.caseId))
      throw new Error(`Duplicate evaluation case: ${result.caseId}`);
    casesById.set(result.caseId, result);
  }

  const goldenCases: PromotionCaseResult[] = [];
  for (const caseId of policy.goldenCaseIds) {
    const result = casesById.get(caseId);
    if (!result) {
      reasons.push(`golden-case-missing:${caseId}`);
      continue;
    }
    goldenCases.push(result);
    const checks = new Map<string, DeterministicCheckResult>();
    for (const check of result.deterministicChecks) {
      requireText(check.checkId, 'Deterministic check id');
      requireText(check.evidenceRef, 'Deterministic check evidence');
      if (checks.has(check.checkId)) {
        throw new Error(`Duplicate deterministic check ${check.checkId} in ${caseId}`);
      }
      checks.set(check.checkId, check);
    }
    for (const checkId of policy.requiredDeterministicCheckIds) {
      const check = checks.get(checkId);
      if (!check) reasons.push(`deterministic-check-missing:${caseId}:${checkId}`);
      else if (!check.passed) reasons.push(`deterministic-check-failed:${caseId}:${checkId}`);
    }
    requireText(result.judge.judgeId, 'Case judge id');
    requireText(result.judge.evidenceRef, 'Case judge evidence');
    requireRate(result.judge.score, 'Case judge score');
    if (result.judge.judgeId !== run.calibration.judgeId) {
      reasons.push(`uncalibrated-case-judge:${caseId}`);
    }
    if (result.judge.score < policy.minimumJudgeScore) {
      reasons.push(`judge-score-too-low:${caseId}`);
    }
    if (result.languageScore !== null) requireRate(result.languageScore, 'Case language score');
  }

  for (const locale of policy.requiredLocales) {
    const localeCases = goldenCases.filter((result) => result.locale === locale);
    if (localeCases.length === 0) {
      reasons.push(`locale-not-covered:${locale}`);
      continue;
    }
    if (
      localeCases.some(
        (result) =>
          result.languageScore === null || result.languageScore < policy.minimumLanguageScore,
      )
    ) {
      reasons.push(`language-score-too-low:${locale}`);
    }
  }
  return goldenCases;
}

function validateHumanSample(
  policy: PromotionPolicy,
  run: TaskEvaluationRun,
  goldenCases: PromotionCaseResult[],
  reasons: string[],
): void {
  const goldenIds = new Set(goldenCases.map((result) => result.caseId));
  const reviewedCases = new Set<string>();
  for (const review of run.humanReviews) {
    requireText(review.caseId, 'Human review case id');
    requireText(review.reviewerRef, 'Human reviewer reference');
    requireText(review.evidenceRef, 'Human review evidence');
    requireDate(review.reviewedAt, 'Human review date');
    if (!goldenIds.has(review.caseId))
      throw new Error(`Human review targets unknown case: ${review.caseId}`);
    if (reviewedCases.has(review.caseId)) {
      throw new Error(`Duplicate human review for case: ${review.caseId}`);
    }
    reviewedCases.add(review.caseId);
    if (Date.parse(review.reviewedAt) > Date.parse(run.completedAt)) {
      throw new Error('Human review cannot occur after run completion');
    }
  }
  if (run.humanReviews.length < policy.minimumHumanReviews) {
    reasons.push('human-sample-too-small');
    return;
  }
  const failed = run.humanReviews.filter((review) => review.outcome === 'failed').length;
  if (failed / run.humanReviews.length > policy.maximumHumanFailureRate) {
    reasons.push('human-failure-rate-too-high');
  }
}

function languageQuality(
  policy: PromotionPolicy,
  goldenCases: PromotionCaseResult[],
  run: TaskEvaluationRun,
) {
  return policy.requiredLocales.flatMap((locale) => {
    const scores = goldenCases
      .filter((result) => result.locale === locale && result.languageScore !== null)
      .map((result) => result.languageScore as number);
    if (scores.length === 0) return [];
    return [
      {
        locale,
        score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        evidenceRef: `${run.evidenceRef}#language:${locale}`,
      },
    ];
  });
}

export function evaluateTaskPromotion(
  policy: PromotionPolicy,
  run: TaskEvaluationRun,
): PromotionDecision {
  validatePolicy(policy);
  requireText(run.runId, 'Evaluation run id');
  requireText(run.modelId, 'Evaluation model id');
  requireText(run.evidenceRef, 'Evaluation run evidence');
  requireDate(run.completedAt, 'Evaluation run completion date');
  if (!policy.approvedAt) throw new Error('Approved promotion policy has no approval date');
  if (Date.parse(policy.approvedAt) > Date.parse(run.completedAt)) {
    throw new Error('Promotion policy was approved after the evaluation run');
  }
  if (run.taskId !== policy.taskId) throw new Error('Evaluation task does not match policy');
  if (run.capability !== policy.capability) {
    throw new Error('Evaluation capability does not match policy');
  }

  const reasons: string[] = [];
  validateCalibration(policy, run, reasons);
  const goldenCases = validateCases(policy, run, reasons);
  validateHumanSample(policy, run, goldenCases, reasons);
  const outcome = reasons.length === 0 ? 'passed' : 'failed';
  const deterministicEvidenceRefs = goldenCases.flatMap((result) =>
    result.deterministicChecks.map((check) => check.evidenceRef),
  );
  const humanReviewEvidenceRefs = run.humanReviews.map((review) => review.evidenceRef);

  return {
    outcome,
    reasons,
    validation: {
      modelId: run.modelId,
      taskId: run.taskId,
      capability: run.capability,
      outcome,
      evaluatedAt: run.completedAt,
      evaluationRef: run.evidenceRef,
      languageQuality: languageQuality(policy, goldenCases, run),
      limitations: outcome === 'failed' ? [...reasons] : [],
      promotion: {
        policyId: policy.id,
        runId: run.runId,
        decision: outcome,
        deterministicEvidenceRefs,
        judgeCalibrationRef: run.calibration.evidenceRef,
        judgeEvidenceRefs: goldenCases.map((result) => result.judge.evidenceRef),
        humanReviewEvidenceRefs,
      },
    },
  };
}

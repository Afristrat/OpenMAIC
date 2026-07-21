export type DesignPolicyMetric =
  | 'theory-share'
  | 'practice-share'
  | 'peer-learning-share'
  | 'local-context-share'
  | 'new-concepts-per-block';

export type CompetencyType = 'declarative' | 'procedural' | 'decision' | 'attitudinal' | 'mixed';
export type AudienceLevel = 'novice' | 'intermediate' | 'expert' | 'mixed';
export type RiskLevel = 'low' | 'medium' | 'high';
export type DeliveryMode = 'self-paced' | 'synchronous' | 'blended' | 'workplace';

export interface DesignPolicyContext {
  competencyType: CompetencyType;
  audienceLevel: AudienceLevel;
  riskLevel: RiskLevel;
  deliveryMode: DeliveryMode;
}

export interface DesignPolicyRange {
  min: number;
  max: number;
  unit: 'percent' | 'count';
}

export interface DesignPolicyConditions {
  competencyTypes?: CompetencyType[];
  audienceLevels?: AudienceLevel[];
  riskLevels?: RiskLevel[];
  deliveryModes?: DeliveryMode[];
}

export interface DesignPolicyOption {
  id: string;
  metric: DesignPolicyMetric;
  range: DesignPolicyRange;
  conditions: DesignPolicyConditions;
  rationale: string;
  trigger: string;
  measurement: string;
  evidenceRefs: string[];
}

export interface ResolvedPolicyTraceability {
  id: string;
  rationale: string;
  trigger: string;
  measurement: string;
  evidenceRefs: string[];
}

export type DesignPolicyMetricResolution =
  | { status: 'unconstrained'; optionIds: [] }
  | {
      status: 'recommended';
      optionIds: string[];
      range: DesignPolicyRange;
      traceability: ResolvedPolicyTraceability[];
    }
  | {
      status: 'conflict';
      optionIds: string[];
      reason: string;
      traceability: ResolvedPolicyTraceability[];
    };

export interface DesignPolicyResolution {
  status: 'ready' | 'conflict';
  context: DesignPolicyContext;
  metrics: Record<DesignPolicyMetric, DesignPolicyMetricResolution>;
}

const POLICY_METRICS: DesignPolicyMetric[] = [
  'theory-share',
  'practice-share',
  'peer-learning-share',
  'local-context-share',
  'new-concepts-per-block',
];

const EXPECTED_UNITS: Record<DesignPolicyMetric, DesignPolicyRange['unit']> = {
  'theory-share': 'percent',
  'practice-share': 'percent',
  'peer-learning-share': 'percent',
  'local-context-share': 'percent',
  'new-concepts-per-block': 'count',
};

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validateOption(option: DesignPolicyOption): void {
  if (!nonEmpty(option.id)) throw new Error('Design policy id is required');
  if (!Number.isFinite(option.range.min) || !Number.isFinite(option.range.max)) {
    throw new Error(`Design policy ${option.id} has a non-finite range`);
  }
  if (option.range.min > option.range.max) {
    throw new Error(`Design policy ${option.id} has an inverted range`);
  }
  if (option.range.min < 0) {
    throw new Error(`Design policy ${option.id} has a negative range`);
  }
  if (option.range.unit !== EXPECTED_UNITS[option.metric]) {
    throw new Error(`Design policy ${option.id} uses an invalid unit for ${option.metric}`);
  }
  if (option.range.unit === 'percent' && (option.range.min < 0 || option.range.max > 100)) {
    throw new Error(`Design policy ${option.id} has an invalid percentage range`);
  }
  if (
    option.range.unit === 'count' &&
    (!Number.isInteger(option.range.min) || !Number.isInteger(option.range.max))
  ) {
    throw new Error(`Design policy ${option.id} has a non-integer count range`);
  }
  if (
    !nonEmpty(option.rationale) ||
    !nonEmpty(option.trigger) ||
    !nonEmpty(option.measurement) ||
    option.evidenceRefs.length === 0 ||
    option.evidenceRefs.some((reference) => !nonEmpty(reference))
  ) {
    throw new Error(`Design policy ${option.id} is not traceable`);
  }
  if (
    Object.values(option.conditions).some(
      (condition) => condition !== undefined && condition.length === 0,
    )
  ) {
    throw new Error(`Design policy ${option.id} has an empty condition`);
  }
}

function matches(option: DesignPolicyOption, context: DesignPolicyContext): boolean {
  const { conditions } = option;
  return (
    (!conditions.competencyTypes || conditions.competencyTypes.includes(context.competencyType)) &&
    (!conditions.audienceLevels || conditions.audienceLevels.includes(context.audienceLevel)) &&
    (!conditions.riskLevels || conditions.riskLevels.includes(context.riskLevel)) &&
    (!conditions.deliveryModes || conditions.deliveryModes.includes(context.deliveryMode))
  );
}

function resolveMetric(options: DesignPolicyOption[]): DesignPolicyMetricResolution {
  if (options.length === 0) return { status: 'unconstrained', optionIds: [] };
  const [first] = options;
  if (!first) throw new Error('Design policy resolution received no option');
  const traceability = options.map(({ id, rationale, trigger, measurement, evidenceRefs }) => ({
    id,
    rationale,
    trigger,
    measurement,
    evidenceRefs: [...evidenceRefs],
  }));
  const units = new Set(options.map((option) => option.range.unit));
  if (units.size > 1) {
    return {
      status: 'conflict',
      optionIds: options.map((option) => option.id),
      reason: 'Applicable policies use incompatible units',
      traceability,
    };
  }

  const min = Math.max(...options.map((option) => option.range.min));
  const max = Math.min(...options.map((option) => option.range.max));
  if (min > max) {
    return {
      status: 'conflict',
      optionIds: options.map((option) => option.id),
      reason: 'Applicable policy ranges do not overlap',
      traceability,
    };
  }
  return {
    status: 'recommended',
    optionIds: options.map((option) => option.id),
    range: { min, max, unit: first.range.unit },
    traceability,
  };
}

function applyCrossMetricConstraints(
  metrics: Record<DesignPolicyMetric, DesignPolicyMetricResolution>,
): void {
  const theory = metrics['theory-share'];
  const practice = metrics['practice-share'];
  if (
    theory.status !== 'recommended' ||
    practice.status !== 'recommended' ||
    theory.range.min + practice.range.min <= 100
  ) {
    return;
  }

  const reason = 'Minimum theory and practice shares exceed the available total';
  metrics['theory-share'] = {
    status: 'conflict',
    optionIds: theory.optionIds,
    reason,
    traceability: theory.traceability,
  };
  metrics['practice-share'] = {
    status: 'conflict',
    optionIds: practice.optionIds,
    reason,
    traceability: practice.traceability,
  };
}

export function resolveDesignPolicies(
  context: DesignPolicyContext,
  options: DesignPolicyOption[],
): DesignPolicyResolution {
  const ids = new Set<string>();
  for (const option of options) {
    validateOption(option);
    if (ids.has(option.id)) throw new Error(`Duplicate design policy id: ${option.id}`);
    ids.add(option.id);
  }

  const metrics = Object.fromEntries(
    POLICY_METRICS.map((metric) => [
      metric,
      resolveMetric(
        options.filter((option) => option.metric === metric && matches(option, context)),
      ),
    ]),
  ) as Record<DesignPolicyMetric, DesignPolicyMetricResolution>;
  applyCrossMetricConstraints(metrics);

  return {
    status: Object.values(metrics).some((resolution) => resolution.status === 'conflict')
      ? 'conflict'
      : 'ready',
    context: { ...context },
    metrics,
  };
}

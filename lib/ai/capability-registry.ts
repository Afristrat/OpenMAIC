export const QALEM_CAPABILITIES = [
  'chat',
  'reasoning',
  'vision',
  'embedding',
  'image-generation',
  'image-editing',
  'video-generation',
  'music-generation',
  'speech-generation',
  'transcription',
] as const;

export type QalemCapability = (typeof QALEM_CAPABILITIES)[number];

export type CertificationStatus = 'referenced' | 'reachable' | 'validated' | 'failed';
export type CertificationOutcome = 'passed' | 'failed';

export interface LiteLLMModelInfo {
  model_name: string;
  litellm_params?: { model?: string };
  model_info?: {
    mode?: string | null;
    supports_reasoning?: boolean | null;
    supports_vision?: boolean | null;
    supports_function_calling?: boolean | null;
  };
}

export interface RegistryObservation {
  observedAt: string;
  evidenceRef: string;
}

export interface ModelReferenceEvidence {
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  activeSince: string;
  evidenceRef: string;
}

export interface CapabilityProbeResult {
  modelId: string;
  capability: QalemCapability;
  outcome: CertificationOutcome;
  probedAt: string;
  evidenceRef: string;
  latencyMs: number | null;
  limitations: string[];
}

export interface LanguageQualityMeasurement {
  locale: string;
  score: number;
  evidenceRef: string;
}

export interface TaskValidationResult {
  modelId: string;
  taskId: string;
  capability: QalemCapability;
  outcome: CertificationOutcome;
  evaluatedAt: string;
  evaluationRef: string;
  languageQuality: LanguageQualityMeasurement[];
  limitations: string[];
}

export interface OperationalLimits {
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  maxConcurrency: number | null;
  maxFileBytes: number | null;
  notes: string[];
  observedAt: string | null;
  evidenceRef: string | null;
}

export interface ModelCertification {
  modelId: string;
  transportModel: string;
  transportMode: string | null;
  advertisedCapabilities: QalemCapability[];
  capabilities: QalemCapability[];
  status: CertificationStatus;
  reference: ModelReferenceEvidence;
  lastProbeAt: string | null;
  probes: CapabilityProbeResult[];
  validations: TaskValidationResult[];
  limits: OperationalLimits;
  limitations: string[];
  fallbackModelId: string | null;
}

export interface CapabilityRegistrySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  sourceRevision: string;
  certifications: ModelCertification[];
}

const MODE_CAPABILITY: Readonly<Record<string, QalemCapability>> = {
  chat: 'chat',
  embedding: 'embedding',
  image_generation: 'image-generation',
  audio_speech: 'speech-generation',
  audio_transcription: 'transcription',
};

const EMPTY_LIMITS: OperationalLimits = {
  maxInputTokens: null,
  maxOutputTokens: null,
  maxConcurrency: null,
  maxFileBytes: null,
  notes: [],
  observedAt: null,
  evidenceRef: null,
};

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function assertIsoDate(value: string, label: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid date`);
  }
}

function assertStringList(values: string[], label: string): void {
  if (values.some((value) => !value.trim())) throw new Error(`${label} contains an empty value`);
}

function assertLimits(limits: OperationalLimits): void {
  const numericLimits: Array<[string, number | null]> = [
    ['maxInputTokens', limits.maxInputTokens],
    ['maxOutputTokens', limits.maxOutputTokens],
    ['maxConcurrency', limits.maxConcurrency],
    ['maxFileBytes', limits.maxFileBytes],
  ];
  for (const [name, value] of numericLimits) {
    if (value === null) continue;
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Operational limit ${name} must be a positive integer or null`);
    }
  }
  assertStringList(limits.notes, 'Operational limit notes');
  const hasMeasuredLimit =
    numericLimits.some(([, value]) => value !== null) || limits.notes.length > 0;
  if (hasMeasuredLimit && (!limits.observedAt || !limits.evidenceRef)) {
    throw new Error('Measured operational limits require a date and evidence');
  }
  if (limits.observedAt) assertIsoDate(limits.observedAt, 'Operational limits observation date');
  if (limits.evidenceRef) assertNonEmpty(limits.evidenceRef, 'Operational limits evidence');
}

function latestDate(values: string[]): string | null {
  return values.length > 0
    ? ([...values].sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null)
    : null;
}

function latestByKey<T>(items: T[], keyOf: (item: T) => string, dateOf: (item: T) => string): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    const current = latest.get(key);
    if (!current || Date.parse(dateOf(item)) > Date.parse(dateOf(current))) latest.set(key, item);
  }
  return [...latest.values()];
}

function latestProbes(certification: ModelCertification): CapabilityProbeResult[] {
  return latestByKey(
    certification.probes.filter(
      (probe) => Date.parse(probe.probedAt) >= Date.parse(certification.reference.activeSince),
    ),
    (probe) => probe.capability,
    (probe) => probe.probedAt,
  );
}

function latestValidations(certification: ModelCertification): TaskValidationResult[] {
  return latestByKey(
    certification.validations.filter(
      (validation) =>
        Date.parse(validation.evaluatedAt) >= Date.parse(certification.reference.activeSince),
    ),
    (validation) => `${validation.taskId}:${validation.capability}`,
    (validation) => validation.evaluatedAt,
  );
}

function isValidationCurrent(
  certification: ModelCertification,
  validation: TaskValidationResult,
): boolean {
  const validationDate = Date.parse(validation.evaluatedAt);
  const hadReachableProbe = certification.probes.some(
    (probe) =>
      probe.capability === validation.capability &&
      probe.outcome === 'passed' &&
      Date.parse(probe.probedAt) >= Date.parse(certification.reference.activeSince) &&
      Date.parse(probe.probedAt) <= validationDate,
  );
  const failedAfterValidation = certification.probes.some(
    (probe) =>
      probe.capability === validation.capability &&
      probe.outcome === 'failed' &&
      Date.parse(probe.probedAt) > validationDate,
  );
  return hadReachableProbe && !failedAfterValidation;
}

function assertProbeShape(modelId: string, probe: CapabilityProbeResult): void {
  if (probe.modelId !== modelId) throw new Error('Probe model id does not match');
  assertIsoDate(probe.probedAt, 'Probe date');
  assertNonEmpty(probe.evidenceRef, 'Probe evidence');
  assertStringList(probe.limitations, 'Probe limitations');
  if (probe.latencyMs !== null && (!Number.isFinite(probe.latencyMs) || probe.latencyMs < 0)) {
    throw new Error('Probe latency must be a non-negative number or null');
  }
}

function assertValidationShape(modelId: string, validation: TaskValidationResult): void {
  if (validation.modelId !== modelId) throw new Error('Validation model id does not match');
  assertNonEmpty(validation.taskId, 'Validation task id');
  assertIsoDate(validation.evaluatedAt, 'Validation date');
  assertNonEmpty(validation.evaluationRef, 'Validation evidence');
  assertStringList(validation.limitations, 'Validation limitations');
  const locales = new Set<string>();
  for (const quality of validation.languageQuality) {
    assertNonEmpty(quality.locale, 'Language quality locale');
    assertNonEmpty(quality.evidenceRef, 'Language quality evidence');
    if (!Number.isFinite(quality.score) || quality.score < 0 || quality.score > 1) {
      throw new Error('Language quality score must be between 0 and 1');
    }
    if (locales.has(quality.locale)) {
      throw new Error(`Duplicate language quality locale: ${quality.locale}`);
    }
    locales.add(quality.locale);
  }
}

function deriveStatus(certification: ModelCertification): CertificationStatus {
  if (!certification.reference.active) return 'failed';
  const probes = latestProbes(certification);
  const validations = latestValidations(certification);
  const reachable = probes.some((probe) => probe.outcome === 'passed');
  const validated = validations.some(
    (validation) =>
      validation.outcome === 'passed' &&
      isValidationCurrent(certification, validation) &&
      probes.some(
        (probe) => probe.capability === validation.capability && probe.outcome === 'passed',
      ),
  );
  if (validated) return 'validated';
  if (reachable) return 'reachable';
  if (probes.length > 0) return 'failed';
  return 'referenced';
}

function refreshCertification(certification: ModelCertification): ModelCertification {
  const probes = [...certification.probes].sort((left, right) =>
    `${left.capability}:${left.probedAt}`.localeCompare(`${right.capability}:${right.probedAt}`),
  );
  const validations = [...certification.validations].sort((left, right) =>
    `${left.taskId}:${left.capability}`.localeCompare(`${right.taskId}:${right.capability}`),
  );
  const capabilities = latestProbes({ ...certification, probes })
    .filter((probe) => probe.outcome === 'passed')
    .map((probe) => probe.capability)
    .sort();
  const refreshed = {
    ...certification,
    advertisedCapabilities: [...new Set(certification.advertisedCapabilities)].sort(),
    capabilities: [...new Set(capabilities)],
    probes,
    validations,
    lastProbeAt: latestDate(probes.map((probe) => probe.probedAt)),
    limits: { ...certification.limits, notes: [...certification.limits.notes] },
    limitations: [...certification.limitations],
  };
  return { ...refreshed, status: deriveStatus(refreshed) };
}

/**
 * Metadata from LiteLLM is only an advertised hint. For ComfyUI, the shared
 * `image_generation` mode is a transport protocol and proves no business
 * capability; only a successful capability probe may populate `capabilities`.
 */
export function inferQalemCapabilities(info: LiteLLMModelInfo): QalemCapability[] {
  const capabilities = new Set<QalemCapability>();
  const transportModel = info.litellm_params?.model ?? info.model_name;
  if (transportModel.startsWith('comfyui/')) return [];

  const mode = info.model_info?.mode;
  if (mode && MODE_CAPABILITY[mode]) capabilities.add(MODE_CAPABILITY[mode]);
  if (info.model_info?.supports_reasoning) capabilities.add('reasoning');
  if (info.model_info?.supports_vision) capabilities.add('vision');
  return [...capabilities].sort();
}

export function createReferencedCertification(
  info: LiteLLMModelInfo,
  observation: RegistryObservation,
): ModelCertification {
  assertNonEmpty(info.model_name, 'Model id');
  assertIsoDate(observation.observedAt, 'Reference observation date');
  assertNonEmpty(observation.evidenceRef, 'Reference evidence');
  return refreshCertification({
    modelId: info.model_name,
    transportModel: info.litellm_params?.model ?? info.model_name,
    transportMode: info.model_info?.mode ?? null,
    advertisedCapabilities: inferQalemCapabilities(info),
    capabilities: [],
    status: 'referenced',
    reference: {
      active: true,
      firstSeenAt: observation.observedAt,
      lastSeenAt: observation.observedAt,
      activeSince: observation.observedAt,
      evidenceRef: observation.evidenceRef,
    },
    lastProbeAt: null,
    probes: [],
    validations: [],
    limits: { ...EMPTY_LIMITS, notes: [] },
    limitations: [],
    fallbackModelId: null,
  });
}

export function reconcileLiteLLMReferences(
  existing: ModelCertification[],
  inventory: LiteLLMModelInfo[],
  observation: RegistryObservation,
): ModelCertification[] {
  assertIsoDate(observation.observedAt, 'Inventory observation date');
  assertNonEmpty(observation.evidenceRef, 'Inventory evidence');
  const inventoryIds = new Set<string>();
  for (const info of inventory) {
    assertNonEmpty(info.model_name, 'Model id');
    if (inventoryIds.has(info.model_name)) {
      throw new Error(`Duplicate LiteLLM model id: ${info.model_name}`);
    }
    inventoryIds.add(info.model_name);
  }

  const previous = new Map(existing.map((certification) => [certification.modelId, certification]));
  if (previous.size !== existing.length)
    throw new Error('Existing registry contains duplicate ids');
  const certifications = inventory.map((info) => {
    const current = previous.get(info.model_name);
    if (!current) return createReferencedCertification(info, observation);
    if (Date.parse(observation.observedAt) < Date.parse(current.reference.lastSeenAt)) {
      throw new Error('An older inventory cannot replace newer reference evidence');
    }
    return refreshCertification({
      ...current,
      transportModel: info.litellm_params?.model ?? info.model_name,
      transportMode: info.model_info?.mode ?? null,
      advertisedCapabilities: inferQalemCapabilities(info),
      reference: {
        ...current.reference,
        active: true,
        lastSeenAt: observation.observedAt,
        activeSince: current.reference.active
          ? current.reference.activeSince
          : observation.observedAt,
        evidenceRef: observation.evidenceRef,
      },
    });
  });

  for (const current of existing) {
    if (inventoryIds.has(current.modelId)) continue;
    if (Date.parse(observation.observedAt) < Date.parse(current.reference.lastSeenAt)) {
      throw new Error('An older inventory cannot replace newer reference evidence');
    }
    certifications.push(
      refreshCertification({
        ...current,
        reference: {
          ...current.reference,
          active: false,
          lastSeenAt: observation.observedAt,
          evidenceRef: observation.evidenceRef,
        },
      }),
    );
  }
  return certifications.sort((left, right) => left.modelId.localeCompare(right.modelId));
}

export function recordCapabilityProbe(
  certification: ModelCertification,
  probe: CapabilityProbeResult,
): ModelCertification {
  if (!certification.reference.active) throw new Error('An unreferenced model cannot be probed');
  assertProbeShape(certification.modelId, probe);
  if (Date.parse(probe.probedAt) < Date.parse(certification.reference.activeSince)) {
    throw new Error('A probe cannot predate the current model reference cycle');
  }
  const latestPrevious = certification.probes
    .filter((item) => item.capability === probe.capability)
    .sort((left, right) => Date.parse(right.probedAt) - Date.parse(left.probedAt))[0];
  if (latestPrevious && Date.parse(latestPrevious.probedAt) >= Date.parse(probe.probedAt)) {
    throw new Error('Probe evidence must be newer than the current capability probe');
  }
  return refreshCertification({
    ...certification,
    probes: [...certification.probes, { ...probe, limitations: [...probe.limitations] }],
  });
}

export function recordTaskValidation(
  certification: ModelCertification,
  validation: TaskValidationResult,
): ModelCertification {
  assertValidationShape(certification.modelId, validation);
  const reachableProbe = latestProbes(certification).find(
    (probe) => probe.capability === validation.capability && probe.outcome === 'passed',
  );
  if (!certification.reference.active || !reachableProbe) {
    throw new Error('A task cannot be validated before its capability is reachable');
  }
  if (Date.parse(validation.evaluatedAt) < Date.parse(reachableProbe.probedAt)) {
    throw new Error('A task validation cannot predate its capability probe');
  }
  const previous = latestValidations(certification).find(
    (item) => item.taskId === validation.taskId && item.capability === validation.capability,
  );
  if (previous && Date.parse(previous.evaluatedAt) >= Date.parse(validation.evaluatedAt)) {
    throw new Error('Validation evidence must be newer than the current task validation');
  }
  return refreshCertification({
    ...certification,
    validations: [
      ...certification.validations,
      {
        ...validation,
        languageQuality: validation.languageQuality.map((quality) => ({ ...quality })),
        limitations: [...validation.limitations],
      },
    ],
  });
}

export function setOperationalLimits(
  certification: ModelCertification,
  limits: OperationalLimits,
): ModelCertification {
  assertLimits(limits);
  return refreshCertification({
    ...certification,
    limits: { ...limits, notes: [...limits.notes] },
  });
}

export function canUseForTask(
  certification: ModelCertification,
  capability: QalemCapability,
  taskId: string,
  locale?: string,
): boolean {
  if (!certification.reference.active || deriveStatus(certification) !== 'validated') return false;
  if (
    !latestProbes(certification).some(
      (probe) => probe.capability === capability && probe.outcome === 'passed',
    )
  ) {
    return false;
  }
  return latestValidations(certification).some(
    (validation) =>
      validation.capability === capability &&
      validation.taskId === taskId &&
      validation.outcome === 'passed' &&
      isValidationCurrent(certification, validation) &&
      (!locale || validation.languageQuality.some((quality) => quality.locale === locale)),
  );
}

function assertFallbackGraph(certifications: ModelCertification[]): void {
  const byId = new Map(
    certifications.map((certification) => [certification.modelId, certification]),
  );
  for (const certification of certifications) {
    const fallback = certification.fallbackModelId;
    if (!fallback) continue;
    if (fallback === certification.modelId) throw new Error('A model cannot be its own fallback');
    if (!byId.has(fallback)) throw new Error(`Unknown fallback model: ${fallback}`);
    const visited = new Set([certification.modelId]);
    let cursor: string | null = fallback;
    while (cursor) {
      if (visited.has(cursor)) throw new Error('Fallback cycle detected');
      visited.add(cursor);
      cursor = byId.get(cursor)?.fallbackModelId ?? null;
    }
  }
}

export function createCapabilityRegistrySnapshot(
  certifications: ModelCertification[],
  generatedAt: string,
  sourceRevision: string,
): CapabilityRegistrySnapshot {
  assertIsoDate(generatedAt, 'Registry generation date');
  assertNonEmpty(sourceRevision, 'Registry source revision');
  const ids = new Set<string>();
  const refreshed = certifications.map((certification) => {
    assertNonEmpty(certification.modelId, 'Model id');
    assertNonEmpty(certification.transportModel, 'Transport model');
    if (ids.has(certification.modelId)) {
      throw new Error(`Duplicate certification model id: ${certification.modelId}`);
    }
    ids.add(certification.modelId);
    assertIsoDate(certification.reference.firstSeenAt, 'First reference date');
    assertIsoDate(certification.reference.lastSeenAt, 'Last reference date');
    assertIsoDate(certification.reference.activeSince, 'Current reference cycle date');
    assertNonEmpty(certification.reference.evidenceRef, 'Reference evidence');
    if (
      Date.parse(certification.reference.firstSeenAt) >
      Date.parse(certification.reference.lastSeenAt)
    ) {
      throw new Error('First reference date cannot be after the last reference date');
    }
    if (
      Date.parse(certification.reference.activeSince) <
        Date.parse(certification.reference.firstSeenAt) ||
      Date.parse(certification.reference.activeSince) >
        Date.parse(certification.reference.lastSeenAt)
    ) {
      throw new Error('Current reference cycle must fit within the observed reference period');
    }
    assertStringList(certification.limitations, 'Model limitations');
    const probeKeys = new Set<string>();
    certification.probes.forEach((probe) => assertProbeShape(certification.modelId, probe));
    for (const probe of certification.probes) {
      const key = `${probe.capability}:${probe.probedAt}`;
      if (probeKeys.has(key)) {
        throw new Error(`Duplicate capability probe: ${key}`);
      }
      probeKeys.add(key);
    }
    const validationKeys = new Set<string>();
    for (const validation of certification.validations) {
      assertValidationShape(certification.modelId, validation);
      const key = `${validation.taskId}:${validation.capability}:${validation.evaluatedAt}`;
      if (validationKeys.has(key)) throw new Error(`Duplicate task validation: ${key}`);
      validationKeys.add(key);
    }
    assertLimits(certification.limits);
    return refreshCertification(certification);
  });
  assertFallbackGraph(refreshed);
  return {
    schemaVersion: 1,
    generatedAt,
    sourceRevision,
    certifications: refreshed.sort((left, right) => left.modelId.localeCompare(right.modelId)),
  };
}

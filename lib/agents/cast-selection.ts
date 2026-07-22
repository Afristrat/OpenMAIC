import { buildTenantAgentConfigs, type LearningDesignSettings } from '@/lib/agents/persona-catalog';
import { resolveCultureReference } from '@/lib/agents/culture-references';

type GeneratedAgent = ReturnType<typeof buildTenantAgentConfigs>[number];

export interface LearnerCastingProfile {
  culture: string;
  preferences: Record<string, unknown>;
}

export interface TenantCast {
  agents: GeneratedAgent[];
  /** Culture cannot replace names before the S2-011 reference approval. */
  cultureReference: string;
}

const CONTENT_SIGNALS: Readonly<Record<string, readonly string[]>> = {
  analyst: ['analyse', 'analysis', 'donnée', 'data', 'chiffre', 'finance', 'audit', 'risque'],
  coach: ['plan', 'pratique', 'exercice', 'business', 'vente', 'action', 'workflow'],
  creative: ['créati', 'creati', 'design', 'innovation', 'idée', 'idee', 'imaginer'],
  thinker: ['éthique', 'ethique', 'réflex', 'reflex', 'système', 'system', 'stratég'],
};

function stableRank(value: string, seed: string): number {
  let hash = 2166136261;
  for (const char of `${seed}:${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function preferenceIsFalse(value: unknown): boolean {
  return value === false || value === 'false' || value === 'no';
}

function preferenceText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function scoreAgent(
  agent: GeneratedAgent,
  content: string,
  preferences: Record<string, unknown>,
  preferredMechanismIds: readonly string[],
): number {
  if (agent.mechanismId === 'joker' && preferenceIsFalse(preferences.humorOk)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = agent.interactionWeight ?? 0;
  if (agent.mechanismId && preferredMechanismIds.includes(agent.mechanismId)) score += 100;
  for (const [mechanismId, signals] of Object.entries(CONTENT_SIGNALS)) {
    if (signals.some((signal) => content.includes(signal)) && agent.mechanismId === mechanismId) {
      score += 30;
    }
  }

  const pace = preferenceText(preferences.pace);
  if (pace === 'slow' && (agent.mechanismId === 'secretary' || agent.mechanismId === 'thinker')) {
    score += 20;
  }
  if (pace === 'fast' && (agent.mechanismId === 'coach' || agent.mechanismId === 'curious')) {
    score += 20;
  }
  return score;
}

function ensureGenderMix(
  selected: GeneratedAgent[],
  candidates: GeneratedAgent[],
  scores: Map<string, number>,
): GeneratedAgent[] {
  const genders = new Set(selected.flatMap((agent) => (agent.gender ? [agent.gender] : [])));
  const missingGender = genders.has('female')
    ? genders.has('male')
      ? undefined
      : 'male'
    : 'female';
  if (!missingGender) return selected;

  const replacement = candidates
    .filter(
      (agent) => agent.gender === missingGender && !selected.some((item) => item.id === agent.id),
    )
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))[0];
  if (!replacement) return selected;

  const replaceIndex = selected
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => agent.role !== 'teacher')
    .sort((a, b) => (scores.get(a.agent.id) ?? 0) - (scores.get(b.agent.id) ?? 0))[0]?.index;
  if (replaceIndex === undefined) return selected;

  return selected.map((agent, index) => (index === replaceIndex ? replacement : agent));
}

/**
 * Select the agents that animate one classroom. The tenant owns personas,
 * voices and weights; learner profile and content select a balanced subset.
 */
export function selectTenantCast({
  design,
  profile,
  content,
  seed,
  preferredMechanismIds = [],
}: {
  design: LearningDesignSettings;
  profile: LearnerCastingProfile;
  content: string;
  seed: string;
  preferredMechanismIds?: readonly string[];
}): TenantCast {
  const roster = buildTenantAgentConfigs(design);
  const teacher = roster.find((agent) => agent.role === 'teacher');
  const candidates = roster.filter((agent) => agent.id !== teacher?.id);
  const normalizedContent = content.toLocaleLowerCase();
  const scores = new Map(
    candidates.map((agent) => [
      agent.id,
      scoreAgent(agent, normalizedContent, profile.preferences, preferredMechanismIds),
    ]),
  );
  const selected = candidates
    .filter((agent) => Number.isFinite(scores.get(agent.id)))
    .sort((a, b) => {
      const byScore = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      return byScore || stableRank(a.id, seed) - stableRank(b.id, seed);
    })
    .slice(0, 3);

  return {
    agents: ensureGenderMix(teacher ? [teacher, ...selected] : selected, candidates, scores),
    cultureReference: resolveCultureReference(profile.culture).code,
  };
}

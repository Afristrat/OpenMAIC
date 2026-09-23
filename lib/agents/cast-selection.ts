import { buildTenantAgentConfigs, type LearningDesignSettings } from '@/lib/agents/persona-catalog';
import {
  CULTURE_REFERENCE_VERSION,
  getCultureNames,
  resolveCultureReference,
} from '@/lib/agents/culture-references';

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

/**
 * Order the complete tenant roster for one classroom. The ten mechanisms are
 * part of the product contract: content and learner preferences may change
 * their priority, but must never silently remove them from the course.
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
  const ranked = candidates.sort((a, b) => {
    const byScore = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    return byScore || stableRank(a.id, seed) - stableRank(b.id, seed);
  });

  const cultureReference = resolveCultureReference(profile.culture).code;
  const completeRoster = teacher ? [teacher, ...ranked] : ranked;
  const approved =
    design.cultureReferenceApprovals[cultureReference]?.version === CULTURE_REFERENCE_VERSION;
  const agents = approved
    ? completeRoster.map((agent) => {
        const names = getCultureNames(cultureReference, agent.gender ?? 'male');
        const selectedName = names[stableRank(agent.id, seed) % names.length];
        return selectedName ? { ...agent, name: selectedName.display } : agent;
      })
    : completeRoster;

  return { agents, cultureReference };
}

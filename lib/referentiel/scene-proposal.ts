import { parseJsonResponse } from '@/lib/generation/json-repair';

/** Scène d'une formation, réduite à ce dont l'IA a besoin pour la rattacher à une compétence. */
export type ProposalScene = { id: string; title: string; type: string; excerpt: string };

/** Compétence visée par la formation : seules celles-ci peuvent être proposées. */
export type ProposalCompetency = { uri: string; title: string };

export type SceneLinkProposal = {
  sceneId: string;
  uri: string;
  nature: 'travaillee' | 'evaluee';
};

const MAX_PER_SCENE = 3;
const EXCERPT_LENGTH = 500;

/** Texte lisible d'une scène (titres, énoncés, questions) tiré de son contenu JSON, borné en longueur. */
export function excerptOf(content: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (parts.join(' ').length > EXCERPT_LENGTH || depth > 6) return;
    if (typeof value === 'string') {
      const text = value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 3 && !/^(https?:|data:|[0-9a-f-]{20,}$)/i.test(text)) parts.push(text);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  };
  visit(content, 0);
  return parts.join(' ').slice(0, EXCERPT_LENGTH);
}

export function proposalPrompt(
  scenes: readonly ProposalScene[],
  competencies: readonly ProposalCompetency[],
): { system: string; prompt: string } {
  return {
    system: `You link the scenes of a training course to the skills the course targets.
You receive the list of scenes and the list of target skills, each with an identifier. For each scene, pick at most ${MAX_PER_SCENE} skills that the scene clearly trains or, for a quiz, clearly assesses. Skip a scene when no skill clearly applies: an empty list is a valid answer. Never invent an identifier and never use an identifier that is not in the lists.
Return only one JSON object: {"links":[{"sceneId":"<scene id>","skillId":"<skill id>","nature":"worked"|"assessed"}]}. Use "assessed" only for a quiz scene. Never use em dashes.`,
    prompt: JSON.stringify({
      scenes: scenes.map((scene) => ({
        id: scene.id,
        type: scene.type,
        title: scene.title,
        excerpt: scene.excerpt,
      })),
      skills: competencies.map((competency) => ({ id: competency.uri, title: competency.title })),
    }),
  };
}

/** Réponse de l'IA validée : seuls des liens entre scènes et compétences connues sont gardés, sans doublon. */
export function parseProposals(
  text: string,
  scenes: readonly ProposalScene[],
  competencies: readonly ProposalCompetency[],
): SceneLinkProposal[] | null {
  const parsed = parseJsonResponse<{ links?: unknown }>(text);
  if (!parsed || !Array.isArray(parsed.links)) return null;

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const known = new Set(competencies.map((competency) => competency.uri));
  const perScene = new Map<string, number>();
  const seen = new Set<string>();
  const proposals: SceneLinkProposal[] = [];
  for (const entry of parsed.links) {
    if (!entry || typeof entry !== 'object') continue;
    const { sceneId, skillId, nature } = entry as Record<string, unknown>;
    if (typeof sceneId !== 'string' || typeof skillId !== 'string') continue;
    const scene = sceneById.get(sceneId);
    if (!scene || !known.has(skillId)) continue;
    const key = `${sceneId}|${skillId}`;
    if (seen.has(key) || (perScene.get(sceneId) ?? 0) >= MAX_PER_SCENE) continue;
    seen.add(key);
    perScene.set(sceneId, (perScene.get(sceneId) ?? 0) + 1);
    proposals.push({
      sceneId,
      uri: skillId,
      nature: nature === 'assessed' && scene.type === 'quiz' ? 'evaluee' : 'travaillee',
    });
  }
  return proposals;
}

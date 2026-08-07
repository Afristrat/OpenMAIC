import { PERSONA_CATALOG, type PersonaDefinition } from '@/lib/agents/persona-catalog';
import { computeAgentScore, type RankedAgent } from './ranking';

export const SYSTEM_AGENT_PREFIX = 'system-persona-';

export interface SystemAgentDetail extends RankedAgent {
  persona: string;
  isSystem: true;
}

function tagsFor(persona: PersonaDefinition): string[] {
  return ['fr', 'ar', 'en', 'beginner', 'intermediate', 'advanced', persona.role, persona.id];
}

export function getSystemAgents(): SystemAgentDetail[] {
  return PERSONA_CATALOG.map((persona) => ({
    id: `${SYSTEM_AGENT_PREFIX}${persona.id}`,
    name: persona.defaultName,
    role: persona.role,
    description: persona.label,
    avatar: persona.avatar,
    color: persona.color,
    tags: tagsFor(persona),
    avgRating: 0,
    usageCount: 0,
    compositeScore: computeAgentScore({ avgRating: 0, usageCount: 0, avgQuizScore: 0.5 }),
    isTopAgent: false,
    ownerNickname: 'Qalem',
    createdAt: '2026-08-07T00:00:00.000Z',
    persona: persona.persona,
    isSystem: true,
  }));
}

export function getSystemAgent(agentId: string): SystemAgentDetail | undefined {
  return getSystemAgents().find((agent) => agent.id === agentId);
}

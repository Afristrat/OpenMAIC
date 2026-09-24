import { describe, expect, it } from 'vitest';
import { DEFAULT_LEARNING_DESIGN } from '@/lib/agents/persona-catalog';
import { prioritizeCompleteTenantRoster, selectTenantCast } from '@/lib/agents/cast-selection';
import { CULTURE_REFERENCE_VERSION, getCultureNames } from '@/lib/agents/culture-references';

const profile = { culture: 'ma-ar', preferences: {} };

describe('selectTenantCast', () => {
  it('conserve une enseignante ou un enseignant et la mixité sur vingt tirages', () => {
    for (let index = 0; index < 20; index += 1) {
      const cast = selectTenantCast({
        design: DEFAULT_LEARNING_DESIGN,
        profile,
        content: 'Analyse de données et décision stratégique.',
        seed: `session-${index}`,
      });
      expect(cast.agents).toHaveLength(10);
      expect(cast.agents.filter((agent) => agent.role === 'teacher')).toHaveLength(1);
      expect(new Set(cast.agents.map((agent) => agent.gender))).toEqual(
        new Set(['female', 'male']),
      );
    }
  });

  it('adapte les mécanismes au contenu et aux préférences sans inventer de prénom culturel', () => {
    const practical = selectTenantCast({
      design: DEFAULT_LEARNING_DESIGN,
      profile: { culture: 'ma-ar', preferences: { pace: 'fast', humorOk: false } },
      content: 'Construire un plan d’action commercial et un exercice de vente.',
      seed: 'practical',
    });

    expect(practical.cultureReference).toBe('ma-ar');
    expect(practical.agents.map((agent) => agent.mechanismId)).toContain('coach');
    expect(practical.agents.map((agent) => agent.mechanismId)).toContain('joker');
    expect(practical.agents.at(-1)?.mechanismId).toBe('joker');
    expect(practical.agents.find((agent) => agent.mechanismId === 'professor')?.name).toBe(
      'Younes',
    );
  });

  it('conserve les dix mécanismes même lorsque le directeur en privilégie trois', () => {
    const cast = selectTenantCast({
      design: DEFAULT_LEARNING_DESIGN,
      profile,
      content: 'Décision, créativité et passage à l’action.',
      seed: 'full-roster',
      preferredMechanismIds: ['coach', 'creative', 'analyst'],
    });

    expect(cast.agents).toHaveLength(10);
    expect(new Set(cast.agents.map((agent) => agent.mechanismId)).size).toBe(10);
    expect(cast.agents.slice(1, 4).map((agent) => agent.mechanismId)).toEqual(
      expect.arrayContaining(['coach', 'creative', 'analyst']),
    );
  });

  it('utilise uniquement les prénoms validés, sans modifier les voix ni les avatars', () => {
    const design = {
      ...DEFAULT_LEARNING_DESIGN,
      cultureReferenceApprovals: {
        'ma-ar': {
          version: CULTURE_REFERENCE_VERSION,
          approvedAt: '2026-07-27T00:00:00.000Z',
          approvedBy: 'admin-id',
        },
      },
    };
    const cast = selectTenantCast({
      design,
      profile,
      content: 'Analyse de données et décision stratégique.',
      seed: 'approved-reference',
    });

    for (const agent of cast.agents) {
      const approvedNames = getCultureNames('ma-ar', agent.gender ?? 'male').map(
        (name) => name.display,
      );
      expect(approvedNames).toContain(agent.name);
      expect(agent.voiceConfig).toBeDefined();
      expect(agent.avatar).toMatch(/^\/avatars\//);
    }
  });
});

describe('prioritizeCompleteTenantRoster', () => {
  it('conserve les dix mécanismes en mode manuel et ne fait que les prioriser', () => {
    const roster = selectTenantCast({
      design: DEFAULT_LEARNING_DESIGN,
      profile,
      content: 'Formation manuelle.',
      seed: 'manual-full-roster',
    }).agents;

    const prioritized = prioritizeCompleteTenantRoster(roster, ['coach', 'analyst']);

    expect(prioritized).toHaveLength(10);
    expect(new Set(prioritized.map((agent) => agent.mechanismId)).size).toBe(10);
    expect(prioritized[0]?.role).toBe('teacher');
    expect(prioritized.slice(1, 3).map((agent) => agent.mechanismId)).toEqual(['coach', 'analyst']);
  });

  it('conserve le référentiel complet sans aucune préférence', () => {
    const roster = selectTenantCast({
      design: DEFAULT_LEARNING_DESIGN,
      profile,
      content: 'Formation sans sélection explicite.',
      seed: 'manual-no-selection',
    }).agents;

    expect(prioritizeCompleteTenantRoster(roster, [])).toEqual(roster);
  });
});

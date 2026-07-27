import { describe, expect, it } from 'vitest';
import { DEFAULT_LEARNING_DESIGN } from '@/lib/agents/persona-catalog';
import { selectTenantCast } from '@/lib/agents/cast-selection';
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
    expect(practical.agents.map((agent) => agent.mechanismId)).not.toContain('joker');
    expect(practical.agents.find((agent) => agent.mechanismId === 'professor')?.name).toBe(
      'Younes',
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

import { describe, expect, it } from 'vitest';
import { PERSONA_CATALOG } from '@/lib/agents/persona-catalog';
import { getSystemAgent, getSystemAgents } from '@/lib/marketplace/system-agents';

describe('system agent marketplace', () => {
  it('expose exactement les dix personæ canoniques', () => {
    const agents = getSystemAgents();
    expect(agents).toHaveLength(10);
    expect(agents.map((agent) => agent.name)).toEqual(
      PERSONA_CATALOG.map((persona) => persona.defaultName),
    );
    expect(agents.every((agent) => agent.persona && agent.avatar && agent.isSystem)).toBe(true);
  });

  it('résout la fiche complète d’un agent système', () => {
    expect(getSystemAgent('system-persona-professor')?.name).toBe('Younes');
    expect(getSystemAgent('unknown')).toBeUndefined();
  });
});

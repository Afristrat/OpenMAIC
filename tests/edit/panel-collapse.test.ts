import { describe, expect, it } from 'vitest';
import {
  EDIT_AGENT_COLLAPSED_KEY,
  EDIT_RAIL_COLLAPSED_KEY,
  readCollapsed,
  shouldAutoExpandAgent,
  writeCollapsed,
} from '@/lib/edit/panel-collapse';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      data.set(k, v);
    },
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('denied');
  },
  setItem: (): void => {
    throw new Error('denied');
  },
};

describe('readCollapsed / writeCollapsed', () => {
  it('est réduit par défaut quand rien n’est mémorisé', () => {
    expect(readCollapsed(EDIT_RAIL_COLLAPSED_KEY, true, fakeStorage())).toBe(true);
  });

  it('relit le choix mémorisé, déployé comme réduit', () => {
    const storage = fakeStorage();
    writeCollapsed(EDIT_AGENT_COLLAPSED_KEY, false, storage);
    expect(readCollapsed(EDIT_AGENT_COLLAPSED_KEY, true, storage)).toBe(false);
    writeCollapsed(EDIT_AGENT_COLLAPSED_KEY, true, storage);
    expect(readCollapsed(EDIT_AGENT_COLLAPSED_KEY, true, storage)).toBe(true);
  });

  it('les deux barres sont mémorisées indépendamment', () => {
    const storage = fakeStorage();
    writeCollapsed(EDIT_RAIL_COLLAPSED_KEY, false, storage);
    expect(readCollapsed(EDIT_AGENT_COLLAPSED_KEY, true, storage)).toBe(true);
  });

  it('ignore une valeur inattendue', () => {
    expect(readCollapsed('k', true, fakeStorage({ k: 'peut-être' }))).toBe(true);
  });

  it('ne plante pas quand le stockage est refusé ou absent', () => {
    expect(readCollapsed('k', true, throwing)).toBe(true);
    expect(() => writeCollapsed('k', false, throwing)).not.toThrow();
    expect(readCollapsed('k', true, null)).toBe(true);
    expect(() => writeCollapsed('k', false, null)).not.toThrow();
  });
});

describe('shouldAutoExpandAgent', () => {
  const idle = { isRunning: false, hasMessages: false };

  it('s’ouvre au démarrage d’une action IA', () => {
    expect(shouldAutoExpandAgent(idle, { isRunning: true, hasMessages: false }, false)).toBe(true);
  });

  it('s’ouvre à l’arrivée d’un premier message', () => {
    expect(shouldAutoExpandAgent(idle, { isRunning: false, hasMessages: true }, false)).toBe(true);
  });

  it('ne se rouvre pas sans changement : l’utilisateur peut replier pendant l’exécution', () => {
    const busy = { isRunning: true, hasMessages: true };
    expect(shouldAutoExpandAgent(busy, busy, false)).toBe(false);
    expect(shouldAutoExpandAgent(busy, idle, false)).toBe(false);
  });

  it('ne touche jamais au tiroir mobile', () => {
    expect(shouldAutoExpandAgent(idle, { isRunning: true, hasMessages: true }, true)).toBe(false);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let useAgentThreadStore: typeof import('@/lib/agent/client/agent-thread-store').useAgentThreadStore;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const thread = (text: string) => ({
  messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text }] }],
  updatedAt: 0,
});

describe('useAgentThreadStore', () => {
  beforeAll(async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    ({ useAgentThreadStore } = await import('@/lib/agent/client/agent-thread-store'));
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => useAgentThreadStore.setState({ threads: {} }));

  it('save then load returns the thread for that stage', () => {
    useAgentThreadStore.getState().save('stage-a', thread('hello'));
    expect(useAgentThreadStore.getState().load('stage-a')).toEqual(thread('hello'));
  });

  it('isolates threads per stage', () => {
    useAgentThreadStore.getState().save('stage-a', thread('a'));
    useAgentThreadStore.getState().save('stage-b', thread('b'));
    expect(useAgentThreadStore.getState().load('stage-a')).toEqual(thread('a'));
    expect(useAgentThreadStore.getState().load('stage-b')).toEqual(thread('b'));
  });

  it('clear removes only that stage', () => {
    useAgentThreadStore.getState().save('stage-a', thread('a'));
    useAgentThreadStore.getState().save('stage-b', thread('b'));
    useAgentThreadStore.getState().clear('stage-a');
    expect(useAgentThreadStore.getState().load('stage-a')).toBeUndefined();
    expect(useAgentThreadStore.getState().load('stage-b')).toEqual(thread('b'));
  });
});

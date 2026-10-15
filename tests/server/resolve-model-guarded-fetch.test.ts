import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModelCalls: [] as Array<Record<string, unknown>>,
  managed: vi.fn(),
}));

vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers')>();
  return {
    ...actual,
    getModel: (args: Record<string, unknown>) => {
      mocks.getModelCalls.push(args);
      return { model: { id: args.modelId }, modelInfo: undefined };
    },
  };
});

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: (...args: unknown[]) => mocks.managed(...args),
  resolveApiKey: (_id: string, clientKey: string) => clientKey || 'server-key',
  // Un fournisseur serveur garde son URL interne ; sinon l'URL du client.
  resolveBaseUrl: (_id: string, clientBaseUrl?: string) =>
    mocks.managed() ? 'http://ollama.internal:11434/v1' : clientBaseUrl,
  resolveProxy: () => undefined,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
  safeFetch: vi.fn(),
}));

describe('resolveModel : fetch gardé pour les URL utilisateur uniquement', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getModelCalls.length = 0;
    mocks.managed.mockReset();
    delete process.env.MODEL_ROUTES;
    delete process.env.DEFAULT_MODEL;
  });

  it('passe le fetch gardé à getModel quand la baseUrl vient de l’utilisateur', async () => {
    mocks.managed.mockReturnValue(false);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    await resolveModel({
      modelString: 'openai:gpt-4o-mini',
      apiKey: 'k',
      baseUrl: 'https://llm.client.example/v1',
    });
    expect(mocks.getModelCalls[0].fetch).toBe(guardedFetch);
  });

  it('garde le fetch natif pour un fournisseur déclaré côté serveur (Ollama interne)', async () => {
    mocks.managed.mockReturnValue(true);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    await resolveModel({
      modelString: 'ollama:llama3',
      baseUrl: 'https://ignore.client.example/v1',
    });
    expect(mocks.getModelCalls[0].fetch).toBeUndefined();
    expect(mocks.getModelCalls[0].baseUrl).toBe('http://ollama.internal:11434/v1');
  });

  it('garde le fetch natif sans baseUrl utilisateur (URL officielle du fournisseur)', async () => {
    mocks.managed.mockReturnValue(false);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    await resolveModel({ modelString: 'openai:gpt-4o-mini', apiKey: 'k' });
    expect(mocks.getModelCalls[0].fetch).toBeUndefined();
  });
});

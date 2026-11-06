import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModelCalls: [] as Array<Record<string, unknown>>,
  readPersonalKey: vi.fn(),
  sessionUser: vi.fn(),
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
  isServerConfiguredProvider: () => true,
  resolveApiKey: () => 'platform-key',
  resolveBaseUrl: () => 'https://proxy.platform.internal/v1',
  resolveProxy: () => undefined,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
  safeFetch: vi.fn(),
}));

vi.mock('@/lib/server/user-api-keys', () => ({
  isPersonalKeyProvider: (id: string) => id !== 'ollama',
  readPersonalKey: mocks.readPersonalKey,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.sessionUser() } }) },
  }),
}));

describe('resolveModel : clé personnelle', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getModelCalls.length = 0;
    mocks.readPersonalKey.mockReset();
    mocks.sessionUser.mockReset();
    delete process.env.MODEL_ROUTES;
    delete process.env.DEFAULT_MODEL;
  });

  it('la clé de la personne remplace celle de la plateforme et vise l’adresse officielle', async () => {
    mocks.sessionUser.mockReturnValue({ id: 'user-1' });
    mocks.readPersonalKey.mockResolvedValue({ apiKey: 'sk-personal-1234', modelId: 'gpt-5.5' });
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const { isPersonalKeyModel } = await import('@/lib/billing/usage-context');

    const resolved = await resolveModel({
      modelString: 'openai:kimi-k2.6',
      apiKey: 'sk-from-browser',
      baseUrl: 'https://evil.example/v1',
    });

    expect(mocks.readPersonalKey).toHaveBeenCalledWith('user-1', 'llm', 'openai');
    expect(resolved.apiKey).toBe('sk-personal-1234');
    expect(mocks.getModelCalls[0].apiKey).toBe('sk-personal-1234');
    expect(mocks.getModelCalls[0].baseUrl).toBe('https://api.openai.com/v1');
    expect(mocks.getModelCalls[0].fetch).toBeUndefined();
    // Le modèle demandé est celui de la plateforme ; avec une clé personnelle, c'est celui de la personne.
    expect(mocks.getModelCalls[0].modelId).toBe('gpt-5.5');
    expect(resolved.modelId).toBe('gpt-5.5');
    expect(resolved.modelString).toBe('openai:gpt-5.5');
    expect(isPersonalKeyModel(resolved.model)).toBe(true);
  });

  it('sans clé personnelle, la clé et l’adresse de la plateforme restent en vigueur', async () => {
    mocks.sessionUser.mockReturnValue({ id: 'user-1' });
    mocks.readPersonalKey.mockResolvedValue(null);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const { isPersonalKeyModel } = await import('@/lib/billing/usage-context');

    const resolved = await resolveModel({ modelString: 'openai:gpt-4o-mini' });

    expect(resolved.apiKey).toBe('platform-key');
    expect(mocks.getModelCalls[0].baseUrl).toBe('https://proxy.platform.internal/v1');
    expect(isPersonalKeyModel(resolved.model)).toBe(false);
  });

  it('sans session, aucune clé personnelle n’est cherchée', async () => {
    mocks.sessionUser.mockReturnValue(null);
    const { resolveModel } = await import('@/lib/server/resolve-model');

    const resolved = await resolveModel({ modelString: 'openai:gpt-4o-mini' });

    expect(mocks.readPersonalKey).not.toHaveBeenCalled();
    expect(resolved.apiKey).toBe('platform-key');
  });

  it('une clé illisible retombe sur la plateforme sans bloquer la génération', async () => {
    mocks.sessionUser.mockReturnValue({ id: 'user-1' });
    mocks.readPersonalKey.mockRejectedValue(new Error('unable to authenticate data'));
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const { isPersonalKeyModel } = await import('@/lib/billing/usage-context');

    const resolved = await resolveModel({ modelString: 'openai:gpt-4o-mini' });

    expect(resolved.apiKey).toBe('platform-key');
    expect(isPersonalKeyModel(resolved.model)).toBe(false);
  });

  it('un fournisseur sans clé personnelle possible (Ollama) n’interroge pas la base', async () => {
    mocks.sessionUser.mockReturnValue({ id: 'user-1' });
    const { resolveModel } = await import('@/lib/server/resolve-model');

    await resolveModel({ modelString: 'ollama:llama3' });

    expect(mocks.readPersonalKey).not.toHaveBeenCalled();
  });
});

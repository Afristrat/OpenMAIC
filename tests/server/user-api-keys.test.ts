import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), row: vi.fn(), generateText: vi.fn() }));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      upsert: (row: unknown) => {
        mocks.upsert(row);
        return Promise.resolve({ error: null });
      },
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: mocks.row(), error: null });
        return chain;
      },
    }),
  }),
}));

process.env.LRS_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

import {
  PersonalKeyError,
  isOfficialProviderModel,
  isPersonalKeyProvider,
  parseApiKey,
  personalKeyProviders,
  readPersonalKey,
  savePersonalKey,
  verifyPersonalKey,
} from '@/lib/server/user-api-keys';

describe('clés d’API personnelles', () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.row.mockReset();
    mocks.generateText.mockReset();
  });

  it('accepte les fournisseurs qui exigent une clé, pas Ollama', () => {
    const ids = personalKeyProviders().map((provider) => provider.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    expect(isPersonalKeyProvider('ollama')).toBe(false);
    expect(isPersonalKeyProvider('inconnu')).toBe(false);
  });

  it('nettoie la clé et refuse les valeurs hors bornes ou avec espaces', () => {
    expect(parseApiKey('  sk-abcdefgh12  ')).toBe('sk-abcdefgh12');
    for (const bad of [
      'court',
      'avec un espace-1234',
      'a'.repeat(513),
      42,
      null,
      'clé-accentuée',
    ]) {
      expect(() => parseApiKey(bad)).toThrow(PersonalKeyError);
    }
  });

  it('chiffre la clé, garde quatre caractères et la relit à l’identique', async () => {
    const key = 'sk-secret-ABCD1234';
    await savePersonalKey({
      userId: 'u1',
      kind: 'llm',
      providerId: 'openai',
      modelId: 'gpt-5.5',
      apiKey: key,
    });
    const row = mocks.upsert.mock.calls[0][0] as Record<string, string>;
    expect(row.key_hint).toBe('1234');
    expect(row.model_id).toBe('gpt-5.5');
    expect(JSON.stringify(row)).not.toContain(key);
    expect(row.key_ciphertext.startsWith('\\x')).toBe(true);

    mocks.row.mockReturnValue({
      key_ciphertext: row.key_ciphertext,
      key_iv: row.key_iv,
      key_tag: row.key_tag,
      model_id: row.model_id,
    });
    expect(await readPersonalKey('u1', 'llm', 'openai')).toEqual({
      apiKey: key,
      modelId: 'gpt-5.5',
    });
  });

  it('ne connaît que les modèles officiels du fournisseur', () => {
    expect(isOfficialProviderModel('openai', 'gpt-5.5')).toBe(true);
    expect(isOfficialProviderModel('openai', 'kimi-k2.6')).toBe(false);
    expect(isOfficialProviderModel('inconnu', 'gpt-5.5')).toBe(false);
  });

  it('refuse d’enregistrer pour un fournisseur ou un modèle inconnu', async () => {
    await expect(
      savePersonalKey({
        userId: 'u1',
        kind: 'llm',
        providerId: 'inconnu',
        modelId: 'gpt-5.5',
        apiKey: 'sk-abcdefgh12',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PROVIDER' });
    await expect(
      savePersonalKey({
        userId: 'u1',
        kind: 'llm',
        providerId: 'openai',
        modelId: 'kimi-k2.6',
        apiKey: 'sk-abcdefgh12',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_MODEL' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('distingue une clé refusée (401) d’une panne du fournisseur (503)', async () => {
    mocks.generateText.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 401 }));
    await expect(verifyPersonalKey('openai', 'sk-abcdefgh12', 'gpt-5.5')).rejects.toMatchObject({
      code: 'KEY_REJECTED',
    });
    mocks.generateText.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 503 }));
    await expect(verifyPersonalKey('openai', 'sk-abcdefgh12', 'gpt-5.5')).rejects.toMatchObject({
      code: 'VERIFY_UNAVAILABLE',
    });
    mocks.generateText.mockResolvedValueOnce({ text: 'OK' });
    await expect(verifyPersonalKey('openai', 'sk-abcdefgh12', 'gpt-5.5')).resolves.toBeUndefined();
  });
});

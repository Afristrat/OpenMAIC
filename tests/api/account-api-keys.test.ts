import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/server/user-api-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/user-api-keys')>()),
  listPersonalKeys: mocks.list,
  savePersonalKey: mocks.save,
  verifyPersonalKey: mocks.verify,
  deletePersonalKey: mocks.remove,
  updatePersonalKeyModel: mocks.patch,
}));

import { DELETE, GET, PATCH, PUT } from '@/app/api/account/api-keys/route';
import { PersonalKeyError } from '@/lib/server/user-api-keys';

const url = 'http://localhost/api/account/api-keys';
const put = (body: unknown) =>
  PUT(new NextRequest(url, { method: 'PUT', body: JSON.stringify(body) }));
const del = (providerId: string) =>
  DELETE(new NextRequest(`${url}?providerId=${providerId}`, { method: 'DELETE' }));

describe('/api/account/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } });
  });

  it('refuse sans session', async () => {
    mocks.requireAuth.mockResolvedValue({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect(
      (await put({ providerId: 'openai', modelId: 'gpt-5.5', apiKey: 'sk-abcdefgh12' })).status,
    ).toBe(401);
    expect((await del('openai')).status).toBe(401);
  });

  it('GET ne rend que le fournisseur et les quatre derniers caractères', async () => {
    mocks.list.mockResolvedValue([
      { providerId: 'openai', modelId: 'gpt-5.5', hint: '1234', updatedAt: 't' },
    ]);
    const body = await (await GET(new NextRequest(url))).json();
    expect(body.keys).toEqual([
      { providerId: 'openai', modelId: 'gpt-5.5', hint: '1234', updatedAt: 't' },
    ]);
    expect(body.providers.some((p: { id: string }) => p.id === 'openai')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
  });

  it('PUT essaie la clé puis l’enregistre pour la personne connectée', async () => {
    mocks.verify.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
    const res = await put({ providerId: 'openai', modelId: 'gpt-5.5', apiKey: ' sk-abcdefgh12 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: true, hint: 'gh12' });
    expect(mocks.verify).toHaveBeenCalledWith('openai', 'sk-abcdefgh12', 'gpt-5.5');
    expect(mocks.save).toHaveBeenCalledWith({
      userId: 'u1',
      kind: 'llm',
      providerId: 'openai',
      modelId: 'gpt-5.5',
      apiKey: 'sk-abcdefgh12',
    });
  });

  it('PUT : fournisseur inconnu, clé trop courte, champ en trop : 400 sans appel au fournisseur', async () => {
    expect(
      (await put({ providerId: 'inconnu', modelId: 'gpt-5.5', apiKey: 'sk-abcdefgh12' })).status,
    ).toBe(400);
    expect((await put({ providerId: 'openai', modelId: 'gpt-5.5', apiKey: 'court' })).status).toBe(
      400,
    );
    expect(
      (
        await put({
          providerId: 'openai',
          modelId: 'gpt-5.5',
          apiKey: 'sk-abcdefgh12',
          userId: 'u2',
        })
      ).status,
    ).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('PUT : un modèle qui n’est pas officiel chez le fournisseur est refusé en 400', async () => {
    expect(
      (await put({ providerId: 'openai', modelId: 'kimi-k2.6', apiKey: 'sk-abcdefgh12' })).status,
    ).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('PATCH change le modèle de sa clé seulement, 404 sans clé, 400 si modèle inconnu', async () => {
    const patch = (body: unknown) =>
      PATCH(new NextRequest(url, { method: 'PATCH', body: JSON.stringify(body) }));
    mocks.patch.mockResolvedValueOnce(true);
    expect((await patch({ providerId: 'openai', modelId: 'gpt-5.5' })).status).toBe(200);
    expect(mocks.patch).toHaveBeenCalledWith('u1', 'llm', 'openai', 'gpt-5.5');
    mocks.patch.mockResolvedValueOnce(false);
    expect((await patch({ providerId: 'openai', modelId: 'gpt-5.5' })).status).toBe(404);
    expect((await patch({ providerId: 'openai', modelId: 'kimi-k2.6' })).status).toBe(400);
  });

  it('PUT : clé refusée 422, fournisseur muet 502, rien n’est enregistré', async () => {
    mocks.verify.mockRejectedValueOnce(new PersonalKeyError('KEY_REJECTED', 'x'));
    expect(
      (await put({ providerId: 'openai', modelId: 'gpt-5.5', apiKey: 'sk-abcdefgh12' })).status,
    ).toBe(422);
    mocks.verify.mockRejectedValueOnce(new PersonalKeyError('VERIFY_UNAVAILABLE', 'x'));
    expect(
      (await put({ providerId: 'openai', modelId: 'gpt-5.5', apiKey: 'sk-abcdefgh12' })).status,
    ).toBe(502);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('DELETE efface la clé de la personne connectée seulement', async () => {
    mocks.remove.mockResolvedValue(true);
    expect((await del('openai')).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith('u1', 'llm', 'openai');
    expect((await del('inconnu')).status).toBe(400);
  });
});

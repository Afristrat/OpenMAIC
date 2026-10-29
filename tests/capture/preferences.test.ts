import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { preferencesPatchSchema } from '@/lib/capture/preferences';

const OWNER = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  authorized: true,
  user: true,
  saved: [] as unknown[],
  savedModel: [] as unknown[],
  resolveModel: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/capture/token-auth', () => ({
  requireCaptureToken: async () =>
    mocks.authorized
      ? { response: null, ownerId: OWNER, tokenId: 'token-1' }
      : { response: NextResponse.json({ success: false }, { status: 401 }) },
}));
vi.mock('@/lib/api/auth', () => ({
  requireAuth: async () =>
    mocks.user
      ? { user: { id: OWNER }, response: null }
      : { user: null, response: NextResponse.json({ success: false }, { status: 401 }) },
}));
vi.mock('@/lib/capture/preferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/capture/preferences')>()),
  saveCapturePreferences: async (_owner: string, patch: unknown) => {
    mocks.saved.push(patch);
  },
  saveAccountModel: async (_owner: string, model: string) => {
    mocks.savedModel.push(model);
  },
}));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));

import { PUT as putPreferences } from '@/app/api/capture/ingest/preferences/route';
import { PUT as putModel } from '@/app/api/account/model/route';

function put(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.authorized = true;
  mocks.user = true;
  mocks.saved = [];
  mocks.savedModel = [];
  mocks.resolveModel.mockReset().mockResolvedValue({});
});

describe('préférences de capture', () => {
  it('accepte le mode, la narration et la langue, séparément ou ensemble', () => {
    expect(preferencesPatchSchema.safeParse({ captureMode: 'simple' }).success).toBe(true);
    expect(
      preferencesPatchSchema.safeParse({
        captureMode: 'ai',
        narration: true,
        writingLanguage: 'ar',
      }).success,
    ).toBe(true);
    expect(preferencesPatchSchema.safeParse({ writingLanguage: 'pt-BR' }).success).toBe(true);
  });

  it('refuse un modèle, un mode inconnu, une langue mal formée ou un corps vide', () => {
    for (const bad of [
      { model: 'x' },
      { accountModel: 'x' },
      { captureMode: 'auto' },
      { writingLanguage: 'arabe!' },
      {},
    ]) {
      expect(preferencesPatchSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("enregistre les choix de l'extension et refuse un jeton invalide", async () => {
    const ok = await putPreferences(
      put('/api/capture/ingest/preferences', { captureMode: 'ai', narration: false }),
    );
    expect(ok.status).toBe(200);
    expect(mocks.saved).toEqual([{ captureMode: 'ai', narration: false }]);

    mocks.authorized = false;
    expect(
      (await putPreferences(put('/api/capture/ingest/preferences', { captureMode: 'ai' }))).status,
    ).toBe(401);
    expect(mocks.saved).toHaveLength(1);
  });

  it("l'extension ne peut pas imposer un modèle par ses préférences", async () => {
    const response = await putPreferences(
      put('/api/capture/ingest/preferences', { captureMode: 'ai', model: 'openai:gpt-x' }),
    );
    expect(response.status).toBe(400);
    expect(mocks.saved).toHaveLength(0);
  });
});

describe('modèle du compte', () => {
  it("l'application enregistre le modèle courant de l'utilisateur connecté", async () => {
    const response = await putModel(put('/api/account/model', { model: 'openai:gpt-test' }));
    expect(response.status).toBe(200);
    expect(mocks.savedModel).toEqual(['openai:gpt-test']);
  });

  it('refuse sans session, un modèle que le serveur ne résout pas et un corps invalide', async () => {
    mocks.user = false;
    expect((await putModel(put('/api/account/model', { model: 'openai:gpt-test' }))).status).toBe(
      401,
    );
    mocks.user = true;

    mocks.resolveModel.mockRejectedValue(new Error('inconnu'));
    expect((await putModel(put('/api/account/model', { model: 'inconnu:modele' }))).status).toBe(
      422,
    );
    expect((await putModel(put('/api/account/model', { model: 'ab' }))).status).toBe(400);
    expect(
      (await putModel(put('/api/account/model', { model: 'openai:gpt-test', x: 1 }))).status,
    ).toBe(400);
    expect(mocks.savedModel).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { resetDescribeQuota } from '@/lib/capture/describe-limit';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authorized: true,
  orgId: null as string | null,
  accountModel: null as string | null,
  usage: null as { actor: string; org: string } | null,
  idempotencyKeys: [] as string[],
  call: vi.fn(),
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
vi.mock('@/lib/capture/billing-organization', () => ({
  resolveBillingOrganization: async () => mocks.orgId,
}));
vi.mock('@/lib/capture/preferences', () => ({
  readCapturePreferences: async () => ({
    captureMode: 'ai',
    narration: false,
    writingLanguage: 'ar',
    accountModel: mocks.accountModel,
  }),
}));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.call }));
vi.mock('@/lib/billing/usage-context', () => ({
  runWithUsageMeteringContext: (
    headers: Headers,
    actor: string,
    org: string,
    run: () => unknown,
  ) => {
    mocks.usage = { actor, org };
    mocks.idempotencyKeys.push(headers.get('idempotency-key') ?? '');
    return run();
  },
}));

import { POST } from '@/app/api/capture/ingest/describe/route';

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/capture/ingest/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const valid = { task: 'step', prompt: 'Click "Créer une facture" on the page' };

beforeEach(() => {
  resetDescribeQuota();
  mocks.authorized = true;
  mocks.orgId = ORG;
  mocks.accountModel = 'openai:gpt-test';
  mocks.usage = null;
  mocks.idempotencyKeys = [];
  mocks.call.mockReset().mockResolvedValue({ text: ' Cliquer sur « Créer une facture » ' });
  mocks.resolveModel
    .mockReset()
    .mockResolvedValue({ model: { id: 'm' }, thinkingConfig: undefined });
});

describe('POST /api/capture/ingest/describe', () => {
  it('refuse une demande sans jeton valide, sans rien appeler', async () => {
    mocks.authorized = false;
    expect((await POST(request(valid))).status).toBe(401);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("débite l'organisation de l'auteur avec le modèle de son compte", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe('Cliquer sur « Créer une facture »');
    expect(mocks.usage).toEqual({ actor: OWNER, org: ORG });
    expect(mocks.resolveModel).toHaveBeenCalledWith({ modelString: 'openai:gpt-test' });
    expect(mocks.call.mock.calls[0]?.[1]).toBe('capture-describe:step');
  });

  it("ignore tout modèle, clé ou adresse envoyés par l'extension", async () => {
    const response = await POST(
      request(valid, {
        'x-model': 'openai:gpt-hostile',
        'x-api-key': 'sk-hostile',
        'x-base-url': 'https://evil.example',
        'x-provider-type': 'openai',
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveModel).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel.mock.calls[0]?.[0]).toEqual({ modelString: 'openai:gpt-test' });
  });

  it("ignore la clé d'idempotence du client : chaque appel reçoit sa propre clé serveur", async () => {
    await POST(request(valid, { 'idempotency-key': 'rejeu-0000000000000000' }));
    await POST(request(valid, { 'idempotency-key': 'rejeu-0000000000000000' }));
    expect(mocks.idempotencyKeys).toHaveLength(2);
    expect(mocks.idempotencyKeys).not.toContain('rejeu-0000000000000000');
    expect(mocks.idempotencyKeys[0]).not.toBe(mocks.idempotencyKeys[1]);
  });

  it('refuse un modèle, une clé ou un champ inconnu dans le corps', async () => {
    for (const extra of [{ model: 'x' }, { apiKey: 'sk' }, { baseUrl: 'https://e' }]) {
      expect((await POST(request({ ...valid, ...extra }))).status).toBe(400);
    }
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("n'applique aucun modèle par défaut quand le compte n'en a pas encore enregistré", async () => {
    mocks.accountModel = null;
    const response = await POST(request(valid));
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe('MODEL_NOT_SYNCED');
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("refuse quand aucune organisation active n'est associée au compte", async () => {
    mocks.orgId = null;
    const response = await POST(request(valid));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('NO_ORGANIZATION');
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('répond clairement quand le serveur ne sait pas résoudre le modèle du compte', async () => {
    mocks.resolveModel.mockRejectedValue(new Error('no key'));
    const response = await POST(request(valid));
    expect(response.status).toBe(422);
    expect((await response.json()).errorCode).toBe('MODEL_UNAVAILABLE');
  });

  it('traduit un solde insuffisant en 402', async () => {
    mocks.call.mockRejectedValue(new InsufficientCreditsError());
    const response = await POST(request(valid));
    expect(response.status).toBe(402);
    expect((await response.json()).errorCode).toBe('INSUFFICIENT_CREDITS');
  });

  it('borne la tâche, la taille du texte et la sortie', async () => {
    expect((await POST(request({ task: 'chat', prompt: 'x' }))).status).toBe(400);
    expect((await POST(request({ task: 'step', prompt: 'x'.repeat(4001) }))).status).toBe(400);
    expect((await POST(request({ task: 'step', prompt: '   ' }))).status).toBe(400);
    expect((await POST(request('pas du json'))).status).toBe(400);
    expect((await POST(request({ task: 'step', prompt: 'x'.repeat(41_000) }))).status).toBe(413);

    mocks.call.mockResolvedValue({ text: 'y'.repeat(5000) });
    const long = await (await POST(request(valid))).json();
    expect(long.text).toHaveLength(2000);
  });

  it('plafonne le nombre de demandes par jeton', async () => {
    for (let call = 0; call < 30; call++) expect((await POST(request(valid))).status).toBe(200);
    const limited = await POST(request(valid));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it("n'écrit aucun contenu capturé dans les journaux d'erreur", async () => {
    mocks.call.mockRejectedValue(new Error('contenu secret du client'));
    const response = await POST(request({ task: 'rewrite', prompt: 'mot de passe: hunter2' }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
  });
});

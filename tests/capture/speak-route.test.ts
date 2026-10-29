import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { resetMediaQuota } from '@/lib/capture/describe-limit';
import { pickCaptureSpeechProvider } from '@/lib/capture/speech-provider';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authorized: true,
  orgId: null as string | null,
  servers: {} as Record<string, { disabled?: boolean }>,
  usage: null as { actor: string; org: string } | null,
  idempotencyKeys: [] as string[],
  synthesize: vi.fn(),
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
vi.mock('@/lib/server/provider-config', () => ({
  getServerTTSProviders: () => mocks.servers,
  resolveTTSApiKey: () => 'cle-serveur',
  resolveTTSBaseUrl: () => 'https://tts.example/v1',
}));
vi.mock('@/lib/audio/tts-providers', () => ({ generateTTS: mocks.synthesize }));
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

import { POST } from '@/app/api/capture/ingest/speak/route';

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/capture/ingest/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const valid = { text: 'Cliquez sur « Créer une facture ».', language: 'fr-FR' };

beforeEach(() => {
  resetMediaQuota();
  mocks.authorized = true;
  mocks.orgId = ORG;
  mocks.servers = { 'higgs-tts': {} };
  mocks.usage = null;
  mocks.idempotencyKeys = [];
  mocks.synthesize
    .mockReset()
    .mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), format: 'mp3' });
});

describe('POST /api/capture/ingest/speak', () => {
  it('refuse une demande sans jeton valide, sans rien synthétiser', async () => {
    mocks.authorized = false;
    expect((await POST(request(valid))).status).toBe(401);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("synthétise avec le fournisseur de la plateforme et débite l'organisation de l'auteur", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(mocks.usage).toEqual({ actor: OWNER, org: ORG });
    const config = mocks.synthesize.mock.calls[0]?.[0];
    expect(config).toMatchObject({
      providerId: 'higgs-tts',
      apiKey: 'cle-serveur',
      baseUrl: 'https://tts.example/v1',
      language: 'fr',
    });
    expect(mocks.synthesize.mock.calls[0]?.[1]).toBe(valid.text);
  });

  it("ignore toute voix, tout modèle, toute clé ou adresse envoyés par l'extension", async () => {
    for (const extra of [
      { voice: 'x' },
      { model: 'x' },
      { apiKey: 'sk' },
      { baseUrl: 'https://e' },
    ]) {
      expect((await POST(request({ ...valid, ...extra }))).status).toBe(400);
    }
    const ok = await POST(
      request(valid, { 'x-api-key': 'sk-hostile', 'x-base-url': 'https://evil.example' }),
    );
    expect(ok.status).toBe(200);
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    expect(mocks.synthesize.mock.calls[0]?.[0].apiKey).toBe('cle-serveur');
  });

  it("ignore la clé d'idempotence du client : chaque appel reçoit sa propre clé serveur", async () => {
    await POST(request(valid, { 'idempotency-key': 'rejeu-0000000000000000' }));
    await POST(request(valid, { 'idempotency-key': 'rejeu-0000000000000000' }));
    expect(mocks.idempotencyKeys).not.toContain('rejeu-0000000000000000');
    expect(mocks.idempotencyKeys[0]).not.toBe(mocks.idempotencyKeys[1]);
  });

  it('borne le texte et le corps', async () => {
    expect((await POST(request({ text: '   ' }))).status).toBe(400);
    expect((await POST(request({ text: 'x'.repeat(1501) }))).status).toBe(400);
    expect((await POST(request('pas du json'))).status).toBe(400);
    expect((await POST(request({ text: 'x'.repeat(9000) }))).status).toBe(413);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("refuse quand aucune organisation active n'est associée au compte", async () => {
    mocks.orgId = null;
    const response = await POST(request(valid));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('NO_ORGANIZATION');
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it("n'utilise jamais un fournisseur inconnu du catalogue ni un fournisseur désactivé, et répond clairement sans fournisseur", async () => {
    mocks.servers = {
      'retired-tts': {},
      'openai-tts': { disabled: true },
      'browser-native-tts': {},
    };
    expect(pickCaptureSpeechProvider(mocks.servers)).toBeNull();
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    expect(mocks.synthesize).not.toHaveBeenCalled();

    mocks.servers = { 'retired-tts': {}, 'higgs-tts': {} };
    expect(pickCaptureSpeechProvider(mocks.servers)?.providerId).toBe('higgs-tts');
  });

  it('traduit un solde insuffisant en 402', async () => {
    mocks.synthesize.mockRejectedValue(new InsufficientCreditsError());
    const response = await POST(request(valid));
    expect(response.status).toBe(402);
    expect((await response.json()).errorCode).toBe('INSUFFICIENT_CREDITS');
  });

  it('plafonne le nombre de demandes par jeton', async () => {
    for (let call = 0; call < 40; call++) expect((await POST(request(valid))).status).toBe(200);
    const limited = await POST(request(valid));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it("n'écrit aucun texte dans la réponse d'erreur quand la synthèse échoue", async () => {
    mocks.synthesize.mockRejectedValue(new Error('texte confidentiel du client'));
    const response = await POST(request({ text: 'mot de passe: hunter2' }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
  });
});

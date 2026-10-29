import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { resetMediaQuota } from '@/lib/capture/describe-limit';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authorized: true,
  orgId: null as string | null,
  configured: true,
  usage: null as { actor: string; org: string } | null,
  idempotencyKeys: [] as string[],
  metered: [] as Array<{ source: string; billableUnit: string; maxQuantity: number }>,
  providerFetch: vi.fn(),
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
  isServerConfiguredProvider: () => mocks.configured,
  resolveASRApiKey: () => 'cle-serveur',
  resolveASRBaseUrl: () => 'https://asr.example/v1',
}));
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
vi.mock('@/lib/billing/usage-metering', () => ({
  runMeteredTenantUsage: async (input: {
    source: string;
    billableUnit: string;
    maxQuantity: number | (() => Promise<number>);
    execute: () => Promise<unknown>;
  }) => {
    mocks.metered.push({
      source: input.source,
      billableUnit: input.billableUnit,
      maxQuantity:
        typeof input.maxQuantity === 'function' ? await input.maxQuantity() : input.maxQuantity,
    });
    return input.execute();
  },
}));

import { POST } from '@/app/api/capture/ingest/transcribe/route';

/** WAV PCM 16 bits mono 16 kHz : l'en-tête déclare la durée, sans sonde externe. */
function wav(seconds: number): Uint8Array<ArrayBuffer> {
  const sampleRate = 16_000;
  const dataLength = Math.round(seconds * sampleRate * 2);
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataLength, true);
  return bytes;
}

function request(
  body: BodyInit | null,
  headers: Record<string, string> = {},
  query = '?language=fr-FR',
): NextRequest {
  return new NextRequest(`http://localhost/api/capture/ingest/transcribe${query}`, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav', authorization: 'Bearer test', ...headers },
    body,
  });
}

const verbose = {
  text: 'Bonjour',
  language: 'french',
  duration: 1,
  segments: [
    {
      id: 0,
      start: 0,
      end: 1,
      text: ' Bonjour',
      no_speech_prob: 0.01,
      avg_logprob: -0.2,
      compression_ratio: 1.1,
      tokens: [1, 2],
    },
  ],
  words: [{ word: 'Bonjour', start: 0.1, end: 0.8 }],
  usage: { type: 'duration', seconds: 1 },
};

beforeEach(() => {
  resetMediaQuota();
  mocks.authorized = true;
  mocks.orgId = ORG;
  mocks.configured = true;
  mocks.usage = null;
  mocks.idempotencyKeys = [];
  mocks.metered = [];
  mocks.providerFetch.mockReset().mockResolvedValue(Response.json(verbose));
  vi.stubGlobal('fetch', mocks.providerFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/capture/ingest/transcribe', () => {
  it('refuse une demande sans jeton valide, sans rien appeler', async () => {
    mocks.authorized = false;
    expect((await POST(request(wav(1)))).status).toBe(401);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("transcrit, mesure la seconde d'audio et débite l'organisation de l'auteur", async () => {
    const response = await POST(request(wav(2)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe('Bonjour');
    expect(body.segments).toEqual([
      {
        start: 0,
        end: 1,
        text: ' Bonjour',
        no_speech_prob: 0.01,
        avg_logprob: -0.2,
        compression_ratio: 1.1,
      },
    ]);
    expect(body.words).toEqual([{ word: 'Bonjour', start: 0.1, end: 0.8 }]);
    expect(body).not.toHaveProperty('usage');
    expect(mocks.usage).toEqual({ actor: OWNER, org: ORG });
    expect(mocks.metered).toEqual([{ source: 'asr', billableUnit: 'asr_second', maxQuantity: 2 }]);
  });

  it('appelle le fournisseur de la plateforme avec sa clé, son modèle et la langue courte', async () => {
    await POST(
      request(wav(1), {
        authorization: 'Bearer test',
        'x-api-key': 'sk-hostile',
        'x-base-url': 'https://evil.example',
      }),
    );
    const [url, init] = mocks.providerFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://asr.example/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cle-serveur');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('language')).toBe('fr');
  });

  it("ignore la clé d'idempotence du client : chaque appel reçoit sa propre clé serveur", async () => {
    await POST(request(wav(1), { 'idempotency-key': 'rejeu-0000000000000000' }));
    await POST(request(wav(1), { 'idempotency-key': 'rejeu-0000000000000000' }));
    expect(mocks.idempotencyKeys).not.toContain('rejeu-0000000000000000');
    expect(mocks.idempotencyKeys[0]).not.toBe(mocks.idempotencyKeys[1]);
  });

  it("refuse un contenu qui n'est pas un WAV, vide ou trop volumineux, sans appeler le fournisseur", async () => {
    expect(
      (await POST(request('pas un wav, mais assez long pour dépasser quarante-quatre octets')))
        .status,
    ).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(request(new Uint8Array(8 * 1024 * 1024 + 1)))).status).toBe(413);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it('calcule la durée sur le contenu reçu : un débit ou une taille menteurs sont refusés, sans rien débiter', async () => {
    const forged: Array<(bytes: Uint8Array<ArrayBuffer>) => void> = [
      // débit annoncé trop bas : la durée lue serait gonflée ou faussée
      (bytes) => new DataView(bytes.buffer).setUint32(28, 1, true),
      // taille des données annoncée plus petite que le contenu réel
      (bytes) => new DataView(bytes.buffer).setUint32(40, 100, true),
      // taille RIFF qui ne correspond pas au fichier
      (bytes) => new DataView(bytes.buffer).setUint32(4, 36, true),
      // format qui n'est pas du PCM
      (bytes) => new DataView(bytes.buffer).setUint16(20, 3, true),
      // taux d'échantillonnage hors plage
      (bytes) => new DataView(bytes.buffer).setUint32(24, 1_000_000, true),
    ];
    for (const forge of forged) {
      const bytes = wav(2);
      forge(bytes);
      expect((await POST(request(bytes))).status).toBe(400);
    }
    expect(mocks.providerFetch).not.toHaveBeenCalled();
    expect(mocks.metered).toEqual([]);
  });

  it("débite la durée réelle du contenu, pas celle d'un en-tête allégé", async () => {
    // 4 secondes de contenu, en-tête cohérent : la durée débitée est bien 4.
    await POST(request(wav(4)));
    expect(mocks.metered).toEqual([{ source: 'asr', billableUnit: 'asr_second', maxQuantity: 4 }]);
  });

  it('refuse un enregistrement plus long que le plafond avant toute réservation', async () => {
    const response = await POST(request(wav(61)));
    expect(response.status).toBe(413);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
    expect(mocks.metered).toEqual([]);
  });

  it("refuse quand aucune organisation active n'est associée au compte", async () => {
    mocks.orgId = null;
    const response = await POST(request(wav(1)));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('NO_ORGANIZATION');
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it("répond clairement quand la plateforme n'a pas de transcription configurée", async () => {
    mocks.configured = false;
    const response = await POST(request(wav(1)));
    expect(response.status).toBe(503);
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it('traduit un solde insuffisant en 402', async () => {
    mocks.providerFetch.mockRejectedValue(new InsufficientCreditsError());
    const response = await POST(request(wav(1)));
    expect(response.status).toBe(402);
    expect((await response.json()).errorCode).toBe('INSUFFICIENT_CREDITS');
  });

  it('plafonne le nombre de demandes par jeton', async () => {
    for (let call = 0; call < 40; call++) expect((await POST(request(wav(1)))).status).toBe(200);
    const limited = await POST(request(wav(1)));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it("n'écrit aucun contenu dans la réponse d'erreur quand le fournisseur échoue", async () => {
    mocks.providerFetch.mockResolvedValue(
      new Response('phrase confidentielle du client', { status: 500 }),
    );
    const response = await POST(request(wav(1)));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('confidentielle');
  });
});

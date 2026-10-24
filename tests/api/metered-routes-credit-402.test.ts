import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';

const ORG_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  transcribeAudio: vi.fn(),
  generateMeteredImage: vi.fn(),
  requireMember: vi.fn(),
  requireEditor: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/audio/tts-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
  generateTTS: mocks.generateTTS,
}));
vi.mock('@/lib/audio/asr-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/asr-providers')>()),
  transcribeAudio: mocks.transcribeAudio,
}));
vi.mock('@/lib/server/metered-media-providers', () => ({
  generateMeteredImage: mocks.generateMeteredImage,
}));
vi.mock('@/lib/media/image-providers', () => ({
  aspectRatioToDimensions: vi.fn(),
  IMAGE_PROVIDERS: { seedream: { requiresApiKey: false } },
}));
vi.mock('@/lib/server/provider-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/provider-config')>()),
  isServerConfiguredProvider: () => true,
  resolveImageApiKey: () => '',
  resolveImageBaseUrl: () => undefined,
}));
vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireMember,
  requireSuperAdminOrOrgMember: mocks.requireMember,
  requireSuperAdminOrOrgAuthor: mocks.requireEditor,
  requireSuperAdminOrOrgEditor: mocks.requireEditor,
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: () => true,
  readClassroomOwnership: vi.fn().mockResolvedValue({ ownerId: 'owner-1', orgId: ORG_ID }),
}));

const USER = { user: { id: 'user-1', email: 'a@b.c' } };

async function expect402(response: Response): Promise<void> {
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({
    success: false,
    errorCode: 'INSUFFICIENT_CREDITS',
  });
}

describe('routes de consommation : solde insuffisant', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ASR_OPENAI_API_KEY', 'server-key');
    vi.stubEnv('ASR_OPENAI_BASE_URL', 'https://proxy.example.com/v1');
    mocks.generateTTS.mockReset();
    mocks.transcribeAudio.mockReset();
    mocks.generateMeteredImage.mockReset();
    mocks.requireMember.mockReset().mockResolvedValue(USER);
    mocks.requireEditor.mockReset().mockResolvedValue(USER);
  });

  it('POST /api/generate/tts répond 402 quand le fournisseur mesuré refuse faute de solde', async () => {
    mocks.generateTTS.mockRejectedValue(new InsufficientCreditsError());
    const { POST } = await import('@/app/api/generate/tts/route');

    const response = await POST(
      new Request('http://localhost/api/generate/tts', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'tts-402-test-001' },
        body: JSON.stringify({
          orgId: ORG_ID,
          text: 'Bonjour',
          audioId: 'a1',
          ttsProviderId: 'openai-tts',
          ttsVoice: 'alloy',
        }),
      }) as unknown as Parameters<typeof POST>[0],
    );

    await expect402(response);
  });

  it("POST /api/transcription répond 402 quand l'erreur Postgres est enveloppée", async () => {
    mocks.transcribeAudio.mockRejectedValue(
      new Error('upstream', { cause: new Error('INSUFFICIENT_TENANT_CREDITS') }),
    );
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    formData.set('providerId', 'openai-whisper');
    formData.set('orgId', ORG_ID);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'asr-402-test-001' },
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    await expect402(response);
  });

  it('POST /api/generate/image répond 402 au lieu de 500', async () => {
    mocks.generateMeteredImage.mockRejectedValue(new InsufficientCreditsError());
    const { POST } = await import('@/app/api/generate/image/route');

    const response = await POST(
      new Request('http://localhost/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'image-402-test-001',
          'x-image-provider': 'seedream',
        },
        body: JSON.stringify({ classroomId: 'classroom-1', prompt: 'Une salle de classe' }),
      }) as unknown as Parameters<typeof POST>[0],
    );

    await expect402(response);
  });

  it('une erreur ordinaire garde la réponse générique de la route', async () => {
    mocks.generateTTS.mockRejectedValue(new Error('boom'));
    const { POST } = await import('@/app/api/generate/tts/route');

    const response = await POST(
      new Request('http://localhost/api/generate/tts', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'tts-500-test-001' },
        body: JSON.stringify({
          orgId: ORG_ID,
          text: 'Bonjour',
          audioId: 'a1',
          ttsProviderId: 'openai-tts',
          ttsVoice: 'alloy',
        }),
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(500);
  });
});

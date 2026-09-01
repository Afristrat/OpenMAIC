import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdminOrOrgMember: vi.fn(),
}));

vi.mock('@/lib/audio/asr-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/asr-providers')>()),
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgMember: mocks.requireSuperAdminOrOrgMember,
}));

describe('POST /api/transcription', () => {
  const withTenant = (formData: FormData): FormData => {
    formData.set('orgId', '00000000-0000-4000-8000-000000000002');
    return formData;
  };
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ASR_OPENAI_API_KEY', 'server-key');
    vi.stubEnv('ASR_OPENAI_BASE_URL', 'https://proxy.example.com/v1');
    vi.stubEnv('ASR_OPENAI_MODELS', 'whisper-1');
    mocks.transcribeAudio.mockReset().mockResolvedValue({ text: 'Bonjour' });
    mocks.requireAuth.mockReset().mockResolvedValue({ user: { id: 'user-1', email: 'a@b.c' } });
    mocks.requireSuperAdminOrOrgMember
      .mockReset()
      .mockResolvedValue({ user: { id: 'user-1', email: 'a@b.c' } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the server-managed ASR model instead of a stale client model', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    formData.set('providerId', 'openai-whisper');
    formData.set('modelId', 'gpt-4o-mini-transcribe');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'auto', modelId: 'whisper-1' }),
      expect.any(Blob),
    );
  });

  it('normalizes a BCP 47 locale before sending it to Whisper', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    formData.set('providerId', 'openai-whisper');
    formData.set('language', 'ar-MA');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'ar' }),
      expect.any(Blob),
    );
  });

  it('rejects a request without an audio file', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: withTenant(new FormData()),
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'MISSING_REQUIRED_FIELD',
    });
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it('rejects an authenticated upload without a tenant', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(400);
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it('rejects an empty audio file', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob([], { type: 'audio/wav' }), 'audio.wav');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
    });
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it('rejects a non-audio upload', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['not audio'], { type: 'text/plain' }), 'notes.txt');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
    });
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it('returns an empty transcription for valid silence without inventing text', async () => {
    mocks.transcribeAudio.mockResolvedValueOnce({ text: '' });
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['silence'], { type: 'audio/wav' }), 'silence.wav');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, text: '' });
  });

  it('maps an upstream failure to a transcription error', async () => {
    expectConsoleMessages({
      error: [
        '[ERROR] [Transcription] Transcription failed [provider=openai-whisper, model=default]: Error: upstream unavailable',
      ],
    });
    mocks.transcribeAudio.mockRejectedValueOnce(new Error('upstream unavailable'));
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'TRANSCRIPTION_FAILED',
    });
  });

  it('rejects an unauthenticated upload before transcription', async () => {
    mocks.requireSuperAdminOrOrgMember.mockResolvedValueOnce({
      response: new Response(null, { status: 401 }),
    });
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    withTenant(formData);

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(401);
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });
});

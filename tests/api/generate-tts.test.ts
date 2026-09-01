import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateTTS: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdminOrOrgMember: vi.fn(),
}));

vi.mock('@/lib/audio/tts-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
  generateTTS: mocks.generateTTS,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgMember: mocks.requireSuperAdminOrOrgMember,
}));

import { POST } from '@/app/api/generate/tts/route';

const ORG_ID = '00000000-0000-4000-8000-000000000002';

describe('POST /api/generate/tts — ttsLanguageOverride passthrough', () => {
  beforeEach(() => {
    mocks.generateTTS.mockReset();
    mocks.requireAuth.mockReset().mockResolvedValue({ user: { id: 'user-1', email: 'a@b.c' } });
    mocks.requireSuperAdminOrOrgMember
      .mockReset()
      .mockResolvedValue({ user: { id: 'user-1', email: 'a@b.c' } });
  });

  it.each([
    [{ ttsLanguageOverride: 'zh' }, 'higgs-tts'],
    [{ ttsLanguageOverride: 'en' }, 'openai-tts'],
  ])('rejects an unsupported language override before synthesis', async (extra, providerId) => {
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        text: 'LiteLLM',
        audioId: 'a1',
        ttsProviderId: providerId,
        ttsVoice: 'default',
        ...extra,
      }),
    });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before synthesis', async () => {
    const req = new Request('http://localhost/api/generate/tts', { method: 'POST', body: '{' });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  it('rejects an authenticated call without a tenant', async () => {
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Bonjour',
        audioId: 'a1',
        ttsProviderId: 'openai-tts',
        ttsVoice: 'alloy',
      }),
    });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });

  it('forwards ttsLanguageOverride into the TTSModelConfig passed to generateTTS', async () => {
    mocks.generateTTS.mockResolvedValue({ audio: new Uint8Array([1]), format: 'wav' });

    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        text: 'LiteLLM',
        audioId: 'a1',
        ttsProviderId: 'higgs-tts',
        ttsVoice: 'default',
        ttsLanguageOverride: 'en',
      }),
    });
    await POST(req as unknown as Parameters<typeof POST>[0]);

    const [config] = mocks.generateTTS.mock.calls[0];
    expect(config.language).toBe('en');
  });

  it('forwards the classroom language independently of provider-specific overrides', async () => {
    mocks.generateTTS.mockResolvedValue({ audio: new Uint8Array([1]), format: 'wav' });
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        text: 'Un budget de 250 dirhams.',
        audioId: 'a2',
        ttsProviderId: 'openai-tts',
        ttsVoice: 'alloy',
        ttsLanguage: 'fr',
      }),
    });

    await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(mocks.generateTTS.mock.calls[0]?.[0]?.language).toBe('fr');
  });

  it('rejects an unauthenticated provider call before synthesis', async () => {
    mocks.requireSuperAdminOrOrgMember.mockResolvedValueOnce({
      response: new Response(null, { status: 401 }),
    });
    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        text: 'Bonjour',
        audioId: 'a3',
        ttsProviderId: 'openai-tts',
        ttsVoice: 'alloy',
      }),
    });

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(401);
    expect(mocks.generateTTS).not.toHaveBeenCalled();
  });
});

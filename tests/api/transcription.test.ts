import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeAudioMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/audio/asr-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/asr-providers')>()),
  transcribeAudio: transcribeAudioMock,
}));

describe('POST /api/transcription', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ASR_OPENAI_API_KEY', 'server-key');
    vi.stubEnv('ASR_OPENAI_BASE_URL', 'https://proxy.example.com/v1');
    vi.stubEnv('ASR_OPENAI_MODELS', 'whisper-1');
    transcribeAudioMock.mockReset().mockResolvedValue({ text: 'Bonjour' });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the server-managed ASR model instead of a stale client model', async () => {
    const { POST } = await import('@/app/api/transcription/route');
    const formData = new FormData();
    formData.set('audio', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    formData.set('providerId', 'openai-whisper');
    formData.set('modelId', 'gpt-4o-mini-transcribe');

    const response = await POST(
      new Request('http://localhost/api/transcription', {
        method: 'POST',
        body: formData,
      }) as unknown as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    expect(transcribeAudioMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'whisper-1' }),
      expect.any(Blob),
    );
  });
});

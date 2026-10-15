import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Le `fetch` gardé fourni dans la configuration doit être celui qui sort sur le réseau
// (adaptateurs image, TTS, ASR, SDK IA) ; le fetch natif ne sert qu'en l'absence de garde.
const nativeFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', nativeFetch);

const sdk = vi.hoisted(() => ({ openaiOptions: [] as Array<Record<string, unknown>> }));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options: Record<string, unknown>) => {
    sdk.openaiOptions.push(options);
    return { chat: () => ({}), responses: () => ({}) };
  },
}));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetch gardé : plomberie', () => {
  const guarded = vi.fn() as Mock;

  beforeEach(() => {
    nativeFetch.mockReset();
    guarded.mockReset();
    sdk.openaiOptions.length = 0;
  });

  it('adaptateur image : utilise config.fetch, jamais le fetch natif', async () => {
    guarded.mockResolvedValueOnce(json({ data: [{ url: 'https://cdn.example.com/i.png' }] }));
    const { generateWithOpenAIImage } = await import('@/lib/media/adapters/openai-image-adapter');
    await generateWithOpenAIImage(
      {
        providerId: 'openai-image',
        apiKey: 'k',
        baseUrl: 'https://user.example.com/v1',
        fetch: guarded as typeof fetch,
      },
      { prompt: 'x' },
    );
    expect(guarded).toHaveBeenCalledTimes(1);
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('adaptateur image : sans config.fetch, le fetch natif reste utilisé (fournisseur serveur)', async () => {
    nativeFetch.mockResolvedValueOnce(json({ data: [{ url: 'https://cdn.example.com/i.png' }] }));
    const { generateWithOpenAIImage } = await import('@/lib/media/adapters/openai-image-adapter');
    await generateWithOpenAIImage(
      { providerId: 'openai-image', apiKey: 'k', baseUrl: 'http://internal:8080/v1' },
      { prompt: 'x' },
    );
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('TTS OpenAI : utilise config.fetch', async () => {
    guarded.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    const { generateTTS } = await import('@/lib/audio/tts-providers');
    await generateTTS(
      {
        providerId: 'openai-tts',
        apiKey: 'k',
        baseUrl: 'https://user.example.com/v1',
        voice: 'alloy',
        fetch: guarded as typeof fetch,
      },
      'Bonjour',
    ).catch(() => undefined); // le contrôle de plancher audio peut rejeter un faux MP3
    expect(guarded).toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('ASR Whisper : utilise config.fetch', async () => {
    guarded.mockResolvedValueOnce(json({ text: 'Bonjour' }));
    const { transcribeAudio } = await import('@/lib/audio/asr-providers');
    const wav = Buffer.alloc(16);
    wav.write('RIFF', 0, 'ascii');
    wav.write('WAVE', 8, 'ascii');
    await transcribeAudio(
      {
        providerId: 'openai-whisper',
        apiKey: 'k',
        baseUrl: 'https://user.example.com/v1',
        fetch: guarded as typeof fetch,
      },
      wav,
    ).catch(() => undefined);
    expect(guarded).toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('SDK IA : createOpenAI reçoit le fetch gardé pour une baseUrl utilisateur', async () => {
    const { getModel } = await import('@/lib/ai/providers');
    getModel({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: 'k',
      baseUrl: 'https://user.example.com/v1',
      fetch: guarded as typeof fetch,
    });
    expect(sdk.openaiOptions[0].fetch).toBe(guarded);
  });

  it('SDK IA : un fournisseur compatible (non-OpenAI) passe aussi par le fetch gardé', async () => {
    guarded.mockResolvedValueOnce(json({}));
    const { getModel } = await import('@/lib/ai/providers');
    getModel({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      apiKey: 'k',
      baseUrl: 'https://user.example.com/v1',
      fetch: guarded as typeof fetch,
    });
    const wrapped = sdk.openaiOptions[0].fetch as typeof fetch;
    await wrapped('https://user.example.com/v1/chat/completions', { method: 'POST', body: '{}' });
    expect(guarded).toHaveBeenCalledTimes(1);
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('SDK IA : sans fetch gardé (fournisseur serveur), aucune surcharge pour OpenAI natif', async () => {
    const { getModel } = await import('@/lib/ai/providers');
    getModel({ providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'k' });
    expect(sdk.openaiOptions[0].fetch).toBeUndefined();
  });
});

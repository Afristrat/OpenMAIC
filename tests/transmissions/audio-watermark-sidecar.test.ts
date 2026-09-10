import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function watermark(source = Buffer.from('video')) {
  const { applyAudioSealWatermark } = await import('@/lib/transmissions/audio-watermark-sidecar');
  return applyAudioSealWatermark(source, '0123456789abcdef0123456789abcdef');
}

describe('AudioSeal sidecar boundary', () => {
  it('fails closed until both the isolated URL and token are configured', async () => {
    await expect(watermark()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the composite messages only to a configured sidecar and accepts its attestation', async () => {
    vi.stubEnv('QALEM_AUDIOSEAL_URL', 'http://audioseal.internal:8080');
    vi.stubEnv('QALEM_AUDIOSEAL_TOKEN', 'synthetic-sidecar-token');
    fetchMock.mockResolvedValue(
      new Response(Buffer.from('mp3'), {
        headers: {
          'content-type': 'audio/mpeg',
          'x-qalem-audioseal-model': 'audioseal_wm_16bits',
          'x-qalem-audioseal-segments': '11',
        },
      }),
    );
    await expect(watermark()).resolves.toEqual(Buffer.from('mp3'));
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://audioseal.internal:8080/v1/watermark');
    expect(init.headers).toEqual({ Authorization: 'Bearer synthetic-sidecar-token' });
    expect(init.body).toBeInstanceOf(FormData);
    expect(JSON.parse((init.body as FormData).get('messages') as string)).toHaveLength(11);
  });

  it('rejects an unattested or malformed response', async () => {
    vi.stubEnv('QALEM_AUDIOSEAL_URL', 'http://audioseal.internal:8080');
    vi.stubEnv('QALEM_AUDIOSEAL_TOKEN', 'synthetic-sidecar-token');
    fetchMock.mockResolvedValue(new Response(Buffer.from('not-mp3')));
    await expect(watermark()).rejects.toThrow('invalid watermark');
  });
});

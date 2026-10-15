import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
  agents: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
}));

vi.mock('node:dns', () => ({ promises: { lookup: mocks.lookup } }));
vi.mock('undici', () => ({
  Agent: class {
    destroy = vi.fn().mockResolvedValue(undefined);
    constructor() {
      mocks.agents.push(this as unknown as { destroy: ReturnType<typeof vi.fn> });
    }
  },
  fetch: mocks.fetch,
}));

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('guardedFetch', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.lookup.mockReset();
    mocks.fetch.mockReset();
    mocks.agents.length = 0;
    delete process.env.ALLOW_LOCAL_NETWORKS;
    mocks.lookup.mockResolvedValue(PUBLIC);
  });

  it('refuse une redirection 307 vers 127.0.0.1 (jamais suivie)', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: 'http://127.0.0.1:8080/admin' } }),
    );
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    const { SsrfBlockedError } = await import('@/lib/server/ssrf-guard');

    await expect(
      guardedFetch('https://api.example.com/v1/chat', { method: 'POST' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.agents.every((a) => a.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('refuse un nom dont la résolution pointe vers le réseau local', async () => {
    mocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    await expect(guardedFetch('https://rebind.example.com/x')).rejects.toThrow(
      /Local\/private network/,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('renvoie une Response lisible et libère l’agent à la fin du flux', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(streamOf(['bon', 'jour']), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    const response = await guardedFetch('https://api.example.com/v1/models');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.url).toBe('https://api.example.com/v1/models');
    expect(mocks.agents[0].destroy).not.toHaveBeenCalled();
    expect(await response.text()).toBe('bonjour');
    expect(mocks.agents[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('libère l’agent si le corps est annulé', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(streamOf(['a', 'b']), { status: 200 }));
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    const response = await guardedFetch('https://api.example.com/stream');
    await response.body?.cancel();
    expect(mocks.agents[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('libère l’agent immédiatement quand il n’y a pas de corps (204)', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    const response = await guardedFetch('https://api.example.com/ping');
    expect(response.status).toBe(204);
    expect(mocks.agents[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('transmet méthode, en-têtes, corps et signal, et accepte une URL ou une Request', async () => {
    mocks.fetch.mockImplementation(async () => new Response('ok', { status: 200 }));
    const { guardedFetch } = await import('@/lib/server/guarded-fetch');
    const signal = AbortSignal.timeout(5000);

    await (
      await guardedFetch(new URL('https://api.example.com/a'), {
        method: 'POST',
        headers: { authorization: 'Bearer k' },
        body: '{"x":1}',
        signal,
      })
    ).text();
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe('https://api.example.com/a');
    expect(init).toMatchObject({ method: 'POST', body: '{"x":1}', signal, redirect: 'manual' });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer k');

    await (
      await guardedFetch(
        new Request('https://api.example.com/b', { method: 'PUT', body: 'données' }),
      )
    ).text();
    const [url2, init2] = mocks.fetch.mock.calls[1];
    expect(String(url2)).toBe('https://api.example.com/b');
    expect(init2.method).toBe('PUT');
  });
});

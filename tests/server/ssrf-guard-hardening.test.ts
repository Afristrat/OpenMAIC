import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
  agents: [] as Array<{
    options: {
      autoSelectFamily?: boolean;
      connect?: {
        lookup: (
          hostname: string,
          options: { all?: boolean },
          callback: (...args: unknown[]) => void,
        ) => void;
      };
    };
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('node:dns', () => ({ promises: { lookup: mocks.lookup } }));
vi.mock('undici', () => ({
  Agent: class {
    destroy = vi.fn().mockResolvedValue(undefined);
    constructor(readonly options: (typeof mocks.agents)[number]['options']) {
      mocks.agents.push(this as unknown as (typeof mocks.agents)[number]);
    }
  },
  fetch: mocks.fetch,
}));

const BLOCK = 'Local/private network URLs are not allowed';

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

describe('isPrivateIP — ranges and encodings', () => {
  it.each([
    // IPv4 historiques
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    // plages ajoutées
    '100.64.0.1',
    '100.127.255.254',
    '192.0.0.8',
    '192.0.2.1',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    // IPv6
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    '2001:db8::1',
    // IPv4 mappée / compatible / SIIT, formes pointée et hexadécimale
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '::ffff:100.64.0.1',
    '::7f00:1',
    '::127.0.0.1',
    '::ffff:0:7f00:1',
    // NAT64
    '64:ff9b::',
    '64:ff9b::7f00:1',
    '64:ff9b::8.8.8.8',
    '64:ff9b:1::1',
    // tunnels
    '2002:7f00:0001::',
    '2002:a9fe:a9fe::',
    // formes numériques ambiguës fournies brutes
    '2130706433',
    '0x7f000001',
    '0x7f.1',
    '0177.0.0.1',
    '127.1',
    '[::1]',
    // IPv6 mal formée : fail closed
    '1:2:3:4:5:6:7:8:9',
    '::g',
  ])('treats %s as private', async (ip) => {
    const { isPrivateIP } = await import('@/lib/server/ssrf-guard');
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '192.0.1.1',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2002:0808:0808::',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    'api.openai.com',
    'bad.cafe',
  ])('treats %s as public', async (ip) => {
    const { isPrivateIP } = await import('@/lib/server/ssrf-guard');
    expect(isPrivateIP(ip)).toBe(false);
  });
});

describe('validateUrlForSSRF — URL spellings of private hosts', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.lookup.mockReset();
    delete process.env.ALLOW_LOCAL_NETWORKS;
  });

  it.each([
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://0177.0.0.1/',
    'http://127.1/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://240.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.localhost/',
    'http://LOCALHOST./',
  ])('blocks %s without any DNS lookup', async (url) => {
    const { validateUrlForSSRF } = await import('@/lib/server/ssrf-guard');
    expect(await validateUrlForSSRF(url)).toContain(BLOCK);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('blocks a hostname resolving to a newly covered range', async () => {
    mocks.lookup.mockResolvedValue([{ address: '100.100.1.1', family: 4 }]);
    const { validateUrlForSSRF } = await import('@/lib/server/ssrf-guard');
    expect(await validateUrlForSSRF('https://tailnet.example/')).toContain(BLOCK);
  });

  it('blocks a hostname resolving to NAT64 or IPv4-mapped loopback', async () => {
    const { validateUrlForSSRF } = await import('@/lib/server/ssrf-guard');
    mocks.lookup.mockResolvedValue([{ address: '64:ff9b::7f00:1', family: 6 }]);
    expect(await validateUrlForSSRF('https://a.example/')).toContain(BLOCK);
    mocks.lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
    expect(await validateUrlForSSRF('https://b.example/')).toContain(BLOCK);
  });
});

describe('safeFetch — pinning and redirects', () => {
  const originalEnv = process.env.ALLOW_LOCAL_NETWORKS;

  beforeEach(() => {
    vi.resetModules();
    mocks.lookup.mockReset();
    mocks.fetch.mockReset();
    mocks.agents.length = 0;
    delete process.env.ALLOW_LOCAL_NETWORKS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ALLOW_LOCAL_NETWORKS;
    else process.env.ALLOW_LOCAL_NETWORKS = originalEnv;
  });

  it('pins the connection to the validated address (DNS rebinding)', async () => {
    // 1re résolution (validation) : publique. Toute résolution ultérieure : réseau interne.
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    mocks.fetch.mockResolvedValue(new Response('ok', { status: 200 }));

    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    const { response, dispose } = await safeFetch('https://rebind.example/a.png');

    expect(response.status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    const lookup = mocks.agents[0].options.connect!.lookup;

    // Le socket demande le nom : il ne reçoit que l'adresse validée, sans nouvelle résolution.
    const single = vi.fn();
    lookup('rebind.example', {}, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    const all = vi.fn();
    lookup('rebind.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);

    // L'URL passée à fetch garde le nom d'origine (Host et SNI corrects) et la redirection est manuelle.
    const [fetchedUrl, fetchInit] = mocks.fetch.mock.calls[0];
    expect((fetchedUrl as URL).hostname).toBe('rebind.example');
    expect(fetchInit).toMatchObject({ redirect: 'manual', dispatcher: mocks.agents[0] });

    await dispose();
    expect(mocks.agents[0].destroy).toHaveBeenCalled();
  });

  it('pins an IP literal to itself without DNS', async () => {
    mocks.fetch.mockResolvedValue(new Response('ok'));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await safeFetch('https://8.8.8.8/x');
    const cb = vi.fn();
    mocks.agents[0].options.connect!.lookup('8.8.8.8', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('refuses a hostname that resolves to a private address, before any connection', async () => {
    mocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const { safeFetch, SsrfBlockedError } = await import('@/lib/server/ssrf-guard');
    await expect(safeFetch('https://internal.example/')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.agents).toHaveLength(0);
  });

  it('rejects a redirect to a private IP and never connects to it', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockResolvedValueOnce(redirect('http://169.254.169.254/latest/meta-data/'));
    const { safeFetch, SsrfBlockedError } = await import('@/lib/server/ssrf-guard');
    await expect(safeFetch('https://example.com/start')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.agents[0].destroy).toHaveBeenCalled();
  });

  it('rejects a redirect to a hostname that resolves to a private IP', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '192.168.1.10', family: 4 }]);
    mocks.fetch.mockResolvedValueOnce(redirect('https://evil-redirect.example/'));
    const { safeFetch, SsrfBlockedError } = await import('@/lib/server/ssrf-guard');
    await expect(safeFetch('https://example.com/start')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('revalidates and re-pins every hop, resolving relative Location against the current URL', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '151.101.1.1', family: 4 }]);
    mocks.fetch
      .mockResolvedValueOnce(redirect('https://cdn.example/final.png'))
      .mockResolvedValueOnce(new Response('done', { status: 200 }));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    const { response, finalUrl } = await safeFetch('https://example.com/start');
    expect(await response.text()).toBe('done');
    expect(finalUrl).toBe('https://cdn.example/final.png');
    expect(mocks.lookup).toHaveBeenNthCalledWith(2, 'cdn.example', expect.anything());
    const cb = vi.fn();
    mocks.agents[1].options.connect!.lookup('cdn.example', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '151.101.1.1', 4);
    expect(mocks.agents[0].destroy).toHaveBeenCalled();
  });

  it('stops after the maximum number of redirects', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockImplementation(async () => redirect('https://example.com/loop'));
    const { safeFetch, SafeFetchRedirectError } = await import('@/lib/server/ssrf-guard');
    await expect(
      safeFetch('https://example.com/loop', {}, { maxRedirects: 2 }),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REDIRECTS',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    await expect(safeFetch('https://example.com/loop')).rejects.toBeInstanceOf(
      SafeFetchRedirectError,
    );
  });

  it('rejects a redirect without Location', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302 }));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await expect(safeFetch('https://example.com/x')).rejects.toMatchObject({
      code: 'BAD_REDIRECT',
    });
  });

  it('drops credentials when a redirect leaves the origin', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch
      .mockResolvedValueOnce(redirect('https://other.example/'))
      .mockResolvedValueOnce(new Response('ok'));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await safeFetch('https://example.com/', {
      headers: { Authorization: 'Bearer secret', Accept: 'image/png' },
    });
    const secondHeaders = new Headers(mocks.fetch.mock.calls[1][1].headers);
    expect(secondHeaders.get('authorization')).toBeNull();
    expect(secondHeaders.get('accept')).toBe('image/png');
  });

  it('converts a POST redirected with 303 into a body-less GET', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch
      .mockResolvedValueOnce(redirect('https://example.com/next', 303))
      .mockResolvedValueOnce(new Response('ok'));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await safeFetch('https://example.com/', { method: 'POST', body: 'x' });
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({ method: 'GET' });
    expect(mocks.fetch.mock.calls[1][1].body).toBeUndefined();
  });

  it('does not pin when ALLOW_LOCAL_NETWORKS=true (explicit self-hosted exception)', async () => {
    process.env.ALLOW_LOCAL_NETWORKS = 'true';
    mocks.fetch.mockResolvedValue(new Response('ok'));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await safeFetch('http://192.168.1.10:11434/api/tags');
    expect(mocks.agents[0].options?.connect).toBeUndefined();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('destroys the agent when the network call fails', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockRejectedValue(new Error('ECONNRESET'));
    const { safeFetch } = await import('@/lib/server/ssrf-guard');
    await expect(safeFetch('https://example.com/')).rejects.toThrow('ECONNRESET');
    expect(mocks.agents[0].destroy).toHaveBeenCalled();
  });
});

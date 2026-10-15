import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn(), requireAuth: vi.fn() }));
// Les classes d'erreur restent les vraies ; seule la connexion réseau (épinglée) est simulée.
// La validation des sauts, le rebinding et les redirections sont couverts par
// tests/server/ssrf-guard-hardening.test.ts.
vi.mock('@/lib/server/ssrf-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/ssrf-guard')>()),
  safeFetch: mocks.safeFetch,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const dispose = vi.fn().mockResolvedValue(undefined);

/** safeFetch answers with `make()` for the requested URL (no redirect). */
function upstream(make: () => Response) {
  mocks.safeFetch.mockImplementation(async (url: string) => ({
    response: make(),
    finalUrl: url,
    dispose,
  }));
}

async function postProxy(
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
) {
  const { POST } = await import('@/app/api/proxy-media/route');
  const req = new Request('http://localhost/api/proxy-media', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return POST(req as unknown as NextRequest);
}

describe('POST /api/proxy-media', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.safeFetch.mockReset();
    dispose.mockClear();
    mocks.requireAuth.mockReset();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u1', email: 'u1@example.com' } });
  });

  it('1. direct 200: returns blob with forwarded content-type and releases the connection', async () => {
    const bodyBytes = new Uint8Array([1, 2, 3, 4]);
    upstream(
      () => new Response(bodyBytes, { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );

    const res = await postProxy({ url: 'https://example.com/image.png' });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bodyBytes);
    expect(mocks.safeFetch).toHaveBeenCalledWith('https://example.com/image.png');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('2. blocked target (initial URL or redirect hop): 403 INVALID_URL', async () => {
    const { SsrfBlockedError } = await import('@/lib/server/ssrf-guard');
    mocks.safeFetch.mockRejectedValue(
      new SsrfBlockedError('Local/private network URLs are not allowed'),
    );

    const res = await postProxy({ url: 'http://169.254.169.254/metadata' });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('3. too many redirects returns 502 TOO_MANY_REDIRECTS', async () => {
    const { SafeFetchRedirectError } = await import('@/lib/server/ssrf-guard');
    mocks.safeFetch.mockRejectedValue(
      new SafeFetchRedirectError('TOO_MANY_REDIRECTS', 'Too many redirects'),
    );

    const res = await postProxy({ url: 'https://example.com/loop' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'TOO_MANY_REDIRECTS' });
  });

  it('4. redirect without Location returns 502 UPSTREAM_ERROR', async () => {
    const { SafeFetchRedirectError } = await import('@/lib/server/ssrf-guard');
    mocks.safeFetch.mockRejectedValue(
      new SafeFetchRedirectError('BAD_REDIRECT', 'Redirect response without Location header'),
    );

    const res = await postProxy({ url: 'https://example.com/bad-redirect' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('5. upstream 404 returns 404 UPSTREAM_ERROR (forwarded, not 502)', async () => {
    upstream(() => new Response(null, { status: 404 }));

    const res = await postProxy({ url: 'https://example.com/not-found' });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('6. upstream 503 is collapsed to 502', async () => {
    upstream(() => new Response(null, { status: 503 }));

    const res = await postProxy({ url: 'https://example.com/server-error' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('7. upstream Content-Length exceeding cap returns 502', async () => {
    upstream(
      () =>
        new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(26 * 1024 * 1024), // 26 MiB > 25 MiB cap
          },
        }),
    );

    const res = await postProxy({ url: 'https://example.com/huge-asset' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('8. anonymous caller is rejected with 401 before any fetch', async () => {
    mocks.requireAuth.mockResolvedValue({
      response: new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }),
    });

    const res = await postProxy({ url: 'https://example.com/image.png' });

    expect(res.status).toBe(401);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it('9. non-JSON request Content-Type is rejected with 415', async () => {
    const res = await postProxy(
      { url: 'https://example.com/image.png' },
      { 'Content-Type': 'text/plain' },
    );

    expect(res.status).toBe(415);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it('10. upstream text/html is refused with 415 (reflected XSS)', async () => {
    upstream(
      () =>
        new Response('<script>alert(1)</script>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    );

    const res = await postProxy({ url: 'https://example.com/page' });

    expect(res.status).toBe(415);
  });

  it('11. octet-stream upstream is typed from the URL suffix, unknown suffix is refused', async () => {
    upstream(
      () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    );

    const ok = await postProxy({ url: 'https://example.com/clip.mp4?sig=1' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('video/mp4');

    const refused = await postProxy({ url: 'https://example.com/download' });
    expect(refused.status).toBe(415);
  });

  it('12. response carries a sanitized type and the sandbox headers', async () => {
    upstream(
      () =>
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
        }),
    );

    const res = await postProxy({ url: 'https://example.com/logo.svg' });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(res.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'");
    expect(res.headers.get('Content-Disposition')).toBe('inline');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

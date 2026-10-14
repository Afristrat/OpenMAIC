import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ validateUrlForSSRF: vi.fn(), requireAuth: vi.fn() }));
vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.validateUrlForSSRF }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

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
    mocks.validateUrlForSSRF.mockReset();
    mocks.requireAuth.mockReset();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u1', email: 'u1@example.com' } });
  });

  it('1. direct 200: returns blob with forwarded content-type', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    const bodyBytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bodyBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/image.png' });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const buf = await res.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(bodyBytes);
  });

  it('2. single redirect followed: validates both initial and redirect target', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    const finalBytes = new Uint8Array([10, 20]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/final.png' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(finalBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await postProxy({ url: 'https://example.com/redirect' });

    expect(res.status).toBe(200);
    // validateUrlForSSRF called for both initial URL and redirect target
    expect(mocks.validateUrlForSSRF).toHaveBeenCalledTimes(2);
    expect(mocks.validateUrlForSSRF).toHaveBeenNthCalledWith(1, 'https://example.com/redirect');
    expect(mocks.validateUrlForSSRF).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/final.png',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('3. redirect to private/blocked URL is rejected (SSRF guard)', async () => {
    // Initial URL passes; redirect target is blocked
    mocks.validateUrlForSSRF
      .mockResolvedValueOnce(null) // initial URL: ok
      .mockResolvedValueOnce('Local/private network URLs are not allowed'); // redirect target: blocked
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://192.168.1.1/secret' },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/harmless' });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('4. too many redirects returns 502 TOO_MANY_REDIRECTS', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    // Every fetch returns 302 → infinite loop hits MAX_REDIRECTS (5)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/loop' },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/loop' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'TOO_MANY_REDIRECTS' });
  });

  it('5. initial URL blocked: 403 returned, no fetch attempted', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue('Local/private network URLs are not allowed');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await postProxy({ url: 'http://169.254.169.254/metadata' });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toMatchObject({ errorCode: 'INVALID_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('6. redirect without Location header returns 502', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          // no location header
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/bad-redirect' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('7. upstream 404 returns 404 UPSTREAM_ERROR (forwarded, not 502)', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const res = await postProxy({ url: 'https://example.com/not-found' });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('8. upstream 503 is collapsed to 502', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const res = await postProxy({ url: 'https://example.com/server-error' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('9. upstream Content-Length exceeding cap returns 502', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(26 * 1024 * 1024), // 26 MiB > 25 MiB cap
          },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/huge-asset' });
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toMatchObject({ errorCode: 'UPSTREAM_ERROR' });
  });

  it('10. anonymous caller is rejected with 401 before any fetch', async () => {
    mocks.requireAuth.mockResolvedValue({
      response: new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await postProxy({ url: 'https://example.com/image.png' });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('11. non-JSON request Content-Type is rejected with 415', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await postProxy(
      { url: 'https://example.com/image.png' },
      { 'Content-Type': 'text/plain' },
    );

    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('12. upstream text/html is refused with 415 (reflected XSS)', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<script>alert(1)</script>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/page' });

    expect(res.status).toBe(415);
  });

  it('13. octet-stream upstream is typed from the URL suffix, unknown suffix is refused', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
      ),
    );

    const ok = await postProxy({ url: 'https://example.com/clip.mp4?sig=1' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('video/mp4');

    const refused = await postProxy({ url: 'https://example.com/download' });
    expect(refused.status).toBe(415);
  });

  it('14. response carries a sanitized type and the sandbox headers', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
        }),
      ),
    );

    const res = await postProxy({ url: 'https://example.com/logo.svg' });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(res.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'");
    expect(res.headers.get('Content-Disposition')).toBe('inline');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

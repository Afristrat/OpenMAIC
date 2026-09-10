import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: auth }));
import { GET } from '@/app/api/xapi/status/route';
import { POST } from '@/app/api/xapi/test/route';
const request = () =>
  new NextRequest('https://qalem.ma/api/xapi/test', {
    method: 'POST',
    headers: { origin: 'https://qalem.ma' },
  });
beforeEach(() => {
  auth.mockResolvedValue({ user: { id: 'admin' } });
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
  vi.stubEnv('XAPI_ENDPOINT', 'https://lrs.example/xapi/');
  vi.stubEnv('XAPI_AUTH', 'synthetic-secret');
  vi.stubEnv('XAPI_ENABLED', 'true');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('keeps both routes behind super-admin access', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  auth.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
  expect((await GET(request())).status).toBe(403);
  expect((await POST(request())).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not expose configuration secrets and distinguishes disabled configuration', async () => {
  vi.stubEnv('XAPI_ENDPOINT', 'https://embedded:secret@lrs.example/?token=private');
  const response = await GET(request());
  expect(await response.json()).toEqual({ configured: true, endpoint: null });
  expect(response.headers.get('cache-control')).toContain('no-store');
  vi.stubEnv('XAPI_ENABLED', 'false');
  expect((await (await GET(request())).json()).configured).toBe(false);
  expect((await POST(request())).status).toBe(409);
  vi.stubEnv('XAPI_AUTH', '');
  expect((await POST(request())).status).toBe(409);
});
it('rejects cross-origin tests and unsafe configured URLs before network access', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(
    (await POST(new NextRequest('https://qalem.ma/api/xapi/test', { method: 'POST' }))).status,
  ).toBe(403);
  for (const endpoint of [
    'http://lrs.example',
    'https://user:secret@lrs.example',
    'https://lrs.example?token=secret',
  ]) {
    vi.stubEnv('XAPI_ENDPOINT', endpoint);
    expect((await POST(request())).status).toBe(503);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('checks the native about resource without sending an event or claiming write access', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ version: ['1.0.3'] }));
  vi.stubGlobal('fetch', fetcher);
  const response = await POST(request());
  expect(await response.json()).toEqual({
    success: true,
    connectionVerified: true,
    writeVerified: false,
  });
  expect(String(fetcher.mock.calls[0][0])).toBe('https://lrs.example/xapi/about');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: 'error',
    cache: 'no-store',
    signal: expect.any(AbortSignal),
  });
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
});
it('fails opaquely for upstream errors, malformed content, and incompatible versions', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const response of [
    new Response('secret', { status: 401 }),
    Response.json({}),
    Response.json({ version: ['2.0.0'] }),
    new Response('invalid'),
  ]) {
    fetcher.mockResolvedValueOnce(response);
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('secret');
  }
  fetcher.mockRejectedValueOnce(new Error('secret'));
  expect((await POST(request())).status).toBe(503);
});

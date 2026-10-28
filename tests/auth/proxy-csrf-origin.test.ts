import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';
import { isCrossOriginUnsafeRequest, CSRF_EXEMPT_PATHS } from '@/lib/server/csrf-origin';

const APP_URL = 'https://qalem.example.org';
let ipCounter = 0;

function request(
  path: string,
  init: { method?: string; origin?: string; host?: string; contentType?: string } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = { 'x-real-ip': `203.0.113.${(ipCounter % 250) + 1}` };
  if (init.origin !== undefined) headers.origin = init.origin;
  if (init.host !== undefined) headers.host = init.host;
  if (init.contentType) headers['content-type'] = init.contentType;
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? 'POST', headers });
}

async function isBlocked(req: NextRequest): Promise<boolean> {
  const res = await proxy(req);
  return res.status === 403;
}

describe('proxy CSRF Origin check', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
    vi.stubEnv('TRUST_PROXY_HEADERS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets a same-origin unsafe request through', async () => {
    const res = await proxy(request('/api/chat', { origin: APP_URL }));
    expect(res.status).toBe(200);
  });

  it('rejects a cross-site JSON POST (text/plain preflight bypass) with 403 and a JSON body', async () => {
    const res = await proxy(
      request('/api/classroom', { origin: 'https://evil.example', contentType: 'text/plain' }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toMatchObject({ error: 'Forbidden' });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects a cross-origin %s', async (method) => {
    expect(await isBlocked(request('/api/chat', { method, origin: 'https://evil.example' }))).toBe(
      true,
    );
  });

  it('rejects a same-host look-alike (subdomain, other scheme, other port)', async () => {
    for (const origin of [
      'https://qalem.example.org.evil.example',
      'https://evil.qalem.example.org',
      'http://qalem.example.org',
      'https://qalem.example.org:8443',
    ]) {
      expect(await isBlocked(request('/api/chat', { origin }))).toBe(true);
    }
  });

  it('rejects the opaque "null" origin and a malformed Origin', async () => {
    expect(await isBlocked(request('/api/chat', { origin: 'null' }))).toBe(true);
    expect(await isBlocked(request('/api/chat', { origin: 'not a url' }))).toBe(true);
  });

  it('lets non-browser calls through: no Origin header', async () => {
    expect(await isBlocked(request('/api/chat'))).toBe(false);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('never blocks a safe %s', async (method) => {
    expect(await isBlocked(request('/api/chat', { method, origin: 'https://evil.example' }))).toBe(
      false,
    );
  });

  describe('explicit exceptions (cross-site by design)', () => {
    it.each([
      '/api/billing/webhook',
      '/api/payments/webhook',
      '/api/lti/launch',
      '/api/lti/login',
      '/api/mcp',
    ])('lets %s through with a foreign Origin', async (path) => {
      const res = await proxy(request(path, { origin: 'https://lms.partner.example' }));
      expect(res.status).toBe(200);
    });

    it('tolerates a trailing slash on an exempt path', async () => {
      expect(
        await isBlocked(request('/api/lti/launch/', { origin: 'https://lms.partner.example' })),
      ).toBe(false);
    });

    it('does not extend an exception to look-alike or sibling paths', async () => {
      for (const path of [
        '/api/lti/launch-evil',
        '/api/lti/launch/extra',
        '/api/lti/bindings',
        '/api/lti/platforms',
        '/api/lti/quiz',
        '/api/mcp/other',
        '/api/webhooks',
        '/api/billing/credits',
        '/api/payments/initiate',
        '/api/v1/generate',
      ]) {
        expect(await isBlocked(request(path, { origin: 'https://evil.example' }))).toBe(true);
      }
    });

    it('lets the capture extension call the Bearer ingest routes with its extension Origin', async () => {
      for (const path of [
        '/api/capture/ingest/pair',
        '/api/capture/ingest/sessions',
        '/api/capture/ingest/sessions/abc/steps',
      ]) {
        const res = await proxy(request(path, { origin: 'chrome-extension://abcdefghijklmnop' }));
        expect(res.status).toBe(200);
      }
    });

    it('does not extend the capture exception to cookie-authenticated or look-alike routes', async () => {
      for (const path of [
        '/api/capture/pairing-codes',
        '/api/capture/ingest',
        '/api/capture/ingest-evil/pair',
        '/api/capture',
      ]) {
        expect(
          await isBlocked(request(path, { origin: 'chrome-extension://abcdefghijklmnop' })),
        ).toBe(true);
      }
    });

    it('keeps the exempt list to exactly the documented routes', () => {
      expect([...CSRF_EXEMPT_PATHS].sort()).toEqual([
        '/api/billing/webhook',
        '/api/lti/launch',
        '/api/lti/login',
        '/api/mcp',
        '/api/payments/webhook',
      ]);
    });
  });

  describe('expected origin resolution', () => {
    it('falls back to the Host header when no public URL is configured', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      const ok = request('/api/chat', {
        origin: 'https://app.internal.example',
        host: 'app.internal.example',
      });
      const ko = request('/api/chat', {
        origin: 'https://evil.example',
        host: 'app.internal.example',
      });
      expect(await isBlocked(ok)).toBe(false);
      expect(await isBlocked(ko)).toBe(true);
    });

    it('also accepts the Host-matching origin when the public URL is configured (proxy keeps Host)', async () => {
      const req = request('/api/chat', {
        origin: 'https://qalem.example.org',
        host: 'qalem.example.org',
      });
      expect(await isBlocked(req)).toBe(false);
    });

    it('does not trust a client-chosen X-Forwarded-Host unless TRUST_PROXY_HEADERS is set', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      const req = new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' },
      });
      expect(isCrossOriginUnsafeRequest(req)).toBe(true);
    });
  });

  it('returns the rate-limit headers on an allowed request (existing behaviour kept)', async () => {
    const res = await proxy(request('/api/chat', { origin: APP_URL }));
    expect(res.headers.get('X-RateLimit-Remaining')).not.toBeNull();
  });
});

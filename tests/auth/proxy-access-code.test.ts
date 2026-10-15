import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';
import { createAccessToken } from '@/lib/server/access-token';

const CODE = 'partage-secret';
let ipCounter = 0;

function request(path: string, init: { method?: string; cookie?: string } = {}): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    'x-real-ip': `198.18.${ipCounter % 250}.${(ipCounter % 200) + 1}`,
  };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? 'GET', headers });
}

describe('proxy ACCESS_CODE server-side gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('ACCESS_CODE unset', () => {
    beforeEach(() => vi.stubEnv('ACCESS_CODE', ''));

    it('does not gate anything', async () => {
      const res = await proxy(request('/api/chat', { method: 'POST' }));
      expect(res.status).toBe(200);
    });
  });

  describe('ACCESS_CODE set', () => {
    beforeEach(() => vi.stubEnv('ACCESS_CODE', CODE));

    it('answers 401 JSON to an API call without the access cookie', async () => {
      const res = await proxy(request('/api/chat', { method: 'POST' }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ error: 'Unauthorized' });
    });

    it('also gates safe methods', async () => {
      expect((await proxy(request('/api/classroom'))).status).toBe(401);
    });

    it('rejects a forged or wrong-code cookie', async () => {
      for (const value of ['garbage', `${Date.now()}.deadbeef`, createAccessToken('autre-code')]) {
        const res = await proxy(request('/api/chat', { cookie: `openmaic_access=${value}` }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects an expired token', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      const token = createAccessToken(CODE);
      vi.setSystemTime(new Date('2026-06-09T00:00:00Z'));
      const res = await proxy(request('/api/chat', { cookie: `openmaic_access=${token}` }));
      expect(res.status).toBe(401);
    });

    it('lets a valid access cookie through', async () => {
      const token = createAccessToken(CODE);
      const res = await proxy(request('/api/chat', { cookie: `openmaic_access=${token}` }));
      expect(res.status).toBe(200);
    });

    it.each([
      ['/api/access-code/verify', 'POST'],
      ['/api/access-code/status', 'GET'],
      ['/api/billing/webhook', 'POST'],
      ['/api/payments/webhook', 'POST'],
      ['/api/lti/launch', 'POST'],
      ['/api/lti/login', 'POST'],
      ['/api/lti/jwks', 'GET'],
      ['/api/lti/config', 'GET'],
      ['/api/mcp', 'POST'],
      ['/api/health', 'GET'],
      ['/api/metrics', 'GET'],
      ['/api/local/public-key', 'GET'],
      ['/api/local/licenses/lic_123/status', 'GET'],
      ['/api/certificates/verify/ABC-123', 'GET'],
    ])('never gates %s (%s)', async (path, method) => {
      const res = await proxy(request(path, { method }));
      expect(res.status).toBe(200);
    });

    it('does not extend an exemption to a look-alike or sibling route', async () => {
      for (const path of [
        '/api/access-code-evil',
        '/api/lti/platforms',
        '/api/lti/quiz',
        '/api/mcp/other',
        '/api/webhooks',
        '/api/local/public-keys',
        '/api/local/devices',
        '/api/local/packages',
        '/api/local/licensesx/a/status',
        '/api/certificates',
        '/api/certificates/generate',
        '/api/certificates/verifyx/a',
        '/api/invitations/signup',
      ]) {
        expect((await proxy(request(path, { method: 'POST' }))).status).toBe(401);
      }
    });
  });
});

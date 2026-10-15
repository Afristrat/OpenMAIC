import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';

let counter = 0;
function request(path: string): NextRequest {
  counter += 1;
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-real-ip': `203.0.114.${(counter % 250) + 1}` },
  });
}

async function isRateLimited(path: string): Promise<boolean> {
  const res = await proxy(request(path));
  return res.headers.get('X-RateLimit-Remaining') !== null;
}

describe('proxy : routes exemptées de la limitation de débit', () => {
  it.each(['/api/health', '/api/health/', '/api/health/live', '/api/metrics', '/api/metrics/x'])(
    'exempte %s',
    async (path) => {
      expect(await isRateLimited(path)).toBe(false);
    },
  );

  it.each(['/api/healthx', '/api/health-check', '/api/metrics-export', '/api/metricsx/a'])(
    'n’exempte pas la route voisine %s',
    async (path) => {
      expect(await isRateLimited(path)).toBe(true);
    },
  );

  it('ne limite pas les chemins hors /api/', async () => {
    expect(await isRateLimited('/_next/static/a.js')).toBe(false);
  });
});

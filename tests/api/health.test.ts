import { describe, expect, it } from 'vitest';
import { GET } from '@/app/health/route';

describe('GET /health', () => {
  it('probes liveness without caching', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

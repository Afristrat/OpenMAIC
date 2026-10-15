import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieSet = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));

const CODE = 'partage-secret';

function attempt(code: string, ip = '198.51.100.7') {
  return new Request('http://localhost/api/access-code/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ code }),
  });
}

describe('POST /api/access-code/verify : limite d’essais', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    vi.stubEnv('ACCESS_CODE', CODE);
    cookieSet.mockReset();
  });

  it('bloque une adresse 15 minutes après 5 échecs, même avec le bon code', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');
    for (let i = 0; i < 5; i++) expect((await POST(attempt('mauvais'))).status).toBe(401);

    const blocked = await POST(attempt(CODE));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(14 * 60);
    expect(cookieSet).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-10-15T10:15:01Z'));
    expect((await POST(attempt(CODE))).status).toBe(200);
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });

  it('n’affecte pas une autre adresse', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');
    for (let i = 0; i < 5; i++) await POST(attempt('mauvais', '198.51.100.17'));
    expect((await POST(attempt(CODE, '198.51.100.18'))).status).toBe(200);
  });

  it('un succès remet le compteur à zéro', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');
    for (let i = 0; i < 4; i++) await POST(attempt('mauvais', '198.51.100.27'));
    expect((await POST(attempt(CODE, '198.51.100.27'))).status).toBe(200);
    for (let i = 0; i < 4; i++) {
      expect((await POST(attempt('mauvais', '198.51.100.27'))).status).toBe(401);
    }
  });

  it('compte aussi un corps sans code comme un échec', async () => {
    const { POST } = await import('@/app/api/access-code/verify/route');
    for (let i = 0; i < 5; i++) {
      await POST(
        new Request('http://localhost/api/access-code/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.39' },
          body: '{}',
        }),
      );
    }
    expect((await POST(attempt(CODE, '198.51.100.39'))).status).toBe(429);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateUrlForSSRF: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.validateUrlForSSRF }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { role: 'admin' } }),
      };
      return query;
    },
  }),
}));

function put(endpoint: string) {
  return new Request('http://localhost/api/organizations/org-1/xapi', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, auth: 'Basic abc', enabled: true }),
  }) as never;
}

describe('PUT /api/organizations/[orgId]/xapi', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validateUrlForSSRF.mockReset();
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    process.env.LRS_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('répond 422 explicite pour un endpoint LRS vers le réseau privé', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue('Local/private network URLs are not allowed');
    const { PUT } = await import('@/app/api/organizations/[orgId]/xapi/route');
    const response = await PUT(put('https://10.0.0.5/xapi'), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errorCode).toBe('INVALID_URL');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('accepte un endpoint public', async () => {
    mocks.validateUrlForSSRF.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/organizations/[orgId]/xapi/route');
    const response = await PUT(put('https://lrs.example.com/xapi'), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

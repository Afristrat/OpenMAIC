import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerClient,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceClient,
}));

import { GET } from '@/app/api/organizations/route';

describe('GET /api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'tahirisophia1@gmail.com');
    mocks.createServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'sophia-id', email: 'tahirisophia1@gmail.com' } },
          error: null,
        }),
      },
    });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [{ id: 'org-1', name: 'ImpactYo', status: 'active' }],
      error: null,
    });
    mocks.serviceFrom.mockReturnValue(query);
    mocks.createServiceClient.mockReturnValue({ from: mocks.serviceFrom });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('gives a super-administrator an active tenant context without a membership', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organizations).toEqual([
      { id: 'org-1', name: 'ImpactYo', status: 'active', userRole: 'admin' },
    ]);
    expect(mocks.serviceFrom).toHaveBeenCalledWith('organizations');
  });
});

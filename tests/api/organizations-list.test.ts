import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  serviceFrom: vi.fn(),
  membershipQuery: {
    select: vi.fn(),
    eq: vi.fn(),
  },
  organizationQuery: {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  },
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
    mocks.membershipQuery.select.mockReturnValue(mocks.membershipQuery);
    mocks.membershipQuery.eq.mockResolvedValue({ data: [], error: null });
    mocks.organizationQuery.select.mockReturnValue(mocks.organizationQuery);
    mocks.organizationQuery.eq.mockReturnValue(mocks.organizationQuery);
    mocks.organizationQuery.order.mockResolvedValue({
      data: [{ id: 'org-1', name: 'ImpactYo', status: 'active' }],
      error: null,
    });
    mocks.serviceFrom.mockImplementation((table: string) =>
      table === 'org_members' ? mocks.membershipQuery : mocks.organizationQuery,
    );
    mocks.createServiceClient.mockReturnValue({ from: mocks.serviceFrom });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('gives a super-administrator an active tenant context without a membership', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organizations).toEqual([
      {
        id: 'org-1',
        name: 'ImpactYo',
        status: 'active',
        userRole: 'admin',
        isDirectMember: false,
      },
    ]);
    expect(mocks.serviceFrom).toHaveBeenCalledWith('organizations');
  });

  it('marks the super-administrator direct workspace without hiding other tenants', async () => {
    mocks.membershipQuery.eq.mockResolvedValue({
      data: [{ org_id: 'org-1', role: 'manager' }],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organizations[0]).toMatchObject({
      id: 'org-1',
      userRole: 'manager',
      isDirectMember: true,
    });
  });
});

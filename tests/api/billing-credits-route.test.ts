import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdminOrOrgAdmin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAdmin: mocks.requireSuperAdminOrOrgAdmin,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { GET } from '@/app/api/billing/credits/route';

const orgId = '00000000-0000-4000-8000-000000000053';

describe('GET /api/billing/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminOrOrgAdmin.mockResolvedValue({
      user: { id: 'user-id', email: 'admin@tenant.test' },
    });
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: {
        balance_microunits: '2500000',
        ledger_balance_microunits: '2500000',
        consistent: true,
      },
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({
      data: [{ id: 'ledger-id', entry_type: 'allocation', delta_microunits: '2500000' }],
      error: null,
    });
  });

  it('lets a tenant administrator read only the requested wallet history', async () => {
    const request = new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`);
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireSuperAdminOrOrgAdmin).toHaveBeenCalledWith(request, orgId);
    expect(mocks.eq).toHaveBeenCalledWith('org_id', orgId);
    expect(body.balanceCredits).toBe(2.5);
    expect(body.entries).toHaveLength(1);
  });

  it('fails closed when cached and ledger balances diverge', async () => {
    mocks.single.mockResolvedValue({
      data: {
        balance_microunits: '2500000',
        ledger_balance_microunits: '2000000',
        consistent: false,
      },
      error: null,
    });
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    expect(response.status).toBe(409);
  });

  it('does not expose a wallet without tenant administration rights', async () => {
    mocks.requireSuperAdminOrOrgAdmin.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

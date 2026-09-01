import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const tenantId = '00000000-0000-4000-8000-000000000053';
const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  reconcileSingle: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { GET } from '@/app/api/admin/tenants/route';

describe('GET /api/admin/tenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({ user: { id: 'root-id', email: 'root@qalem.ma' } });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return {
          select: () => ({
            order: async () => ({
              data: [
                {
                  id: tenantId,
                  name: 'Institut Atlas',
                  status: 'active',
                  seat_limit: 4,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'org_members') {
        return { select: async () => ({ data: [{ org_id: tenantId }], error: null }) };
      }
      return {
        select: () => ({
          is: () => ({
            gt: async () => ({ data: [{ org_id: tenantId }], error: null }),
          }),
        }),
      };
    });
    mocks.rpc.mockReturnValue({ single: mocks.reconcileSingle });
    mocks.reconcileSingle.mockResolvedValue({
      data: { balance_microunits: '2500000', consistent: true },
      error: null,
    });
  });

  it('returns only reconciled balances with seat occupancy', async () => {
    const response = await GET(new NextRequest('https://qalem.ma/api/admin/tenants'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.tenants[0]).toMatchObject({
      id: tenantId,
      memberCount: 1,
      pendingInvitationCount: 1,
      creditBalanceMicrounits: 2_500_000,
    });
  });

  it('fails closed instead of displaying a divergent cached balance', async () => {
    mocks.reconcileSingle.mockResolvedValue({
      data: { balance_microunits: '2500000', consistent: false },
      error: null,
    });
    const response = await GET(new NextRequest('https://qalem.ma/api/admin/tenants'));
    expect(response.status).toBe(409);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isSuperAdminEmail: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
  serverFrom: vi.fn(),
  membership: vi.fn(),
  ledgerRows: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  isSuperAdminEmail: mocks.isSuperAdminEmail,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.serviceFrom }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.serverFrom }),
}));

import { GET } from '@/app/api/billing/credits/route';

const orgId = '00000000-0000-4000-8000-000000000053';

function query<T>(result: { data: T; error: null }): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: { data: T; error: null }) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

describe('GET /api/billing/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      user: { id: 'user-id', email: 'admin@tenant.test' },
    });
    mocks.isSuperAdminEmail.mockReturnValue(false);
    mocks.membership.mockResolvedValue({
      data: { role: 'admin', organizations: { status: 'active' } },
      error: null,
    });
    mocks.serverFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.membership,
    });
    mocks.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          balance_microunits: '2500000',
          ledger_balance_microunits: '2500000',
          consistent: true,
        },
        error: null,
      }),
    });
    mocks.ledgerRows.mockReturnValue([
      {
        id: 'ledger-id',
        actor_user_id: 'user-id',
        entry_type: 'debit',
        delta_microunits: '-250000',
        billable_unit: 'tts_second',
        quantity: '12',
        reason: 'Consommation fournisseur mesurée',
        created_at: '2026-09-24T00:00:00.000Z',
      },
    ]);
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'tenant_credit_ledger') {
        return query({ data: mocks.ledgerRows(), error: null });
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'user-id', nickname: 'Sophia' }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  reservation_debit_id: null,
                  actual_debit_id: 'ledger-id',
                  status: 'settled',
                  valuation_status: 'pending_configuration',
                  valuation_issue: 'PROVIDER_COST_NOT_FOUND',
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    });
  });

  it('lets a tenant administrator read enriched tenant history', async () => {
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.balanceCredits).toBe(2.5);
    expect(body.scope).toBe('tenant');
    expect(body.entries[0]).toMatchObject({
      actorNickname: 'Sophia',
      usageStatus: {
        valuation_status: 'pending_configuration',
        valuation_issue: 'PROVIDER_COST_NOT_FOUND',
      },
    });
  });

  it('limits a regular member to personal entries while preserving the tenant balance', async () => {
    mocks.membership.mockResolvedValue({
      data: { role: 'apprenant', organizations: { status: 'active' } },
      error: null,
    });
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.scope).toBe('personal');
    expect(body.entries).toHaveLength(1);
  });

  it('fails closed when cached and ledger balances diverge', async () => {
    mocks.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          balance_microunits: '2500000',
          ledger_balance_microunits: '2000000',
          consistent: false,
        },
        error: null,
      }),
    });
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    expect(response.status).toBe(409);
  });

  it('does not expose a wallet without active tenant membership', async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    const response = await GET(
      new NextRequest(`https://qalem.ma/api/billing/credits?orgId=${orgId}`),
    );
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

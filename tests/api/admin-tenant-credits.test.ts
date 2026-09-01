import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  postTenantCreditEntry: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/billing/credits', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/billing/credits')>();
  return { ...original, postTenantCreditEntry: mocks.postTenantCreditEntry };
});

import { POST } from '@/app/api/admin/tenants/[tenantId]/credits/route';

const tenantId = '00000000-0000-4000-8000-000000000053';

describe('POST /api/admin/tenants/[tenantId]/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'root@qalem.ma' },
    });
    mocks.postTenantCreditEntry.mockResolvedValue({
      ledgerId: 'ledger-id',
      balanceMicrounits: 2_500_000,
      applied: true,
    });
  });

  it('allocates explicit credits with actor, reason and idempotency', async () => {
    const request = new NextRequest(`https://qalem.ma/api/admin/tenants/${tenantId}/credits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entryType: 'allocation',
        amountCredits: 2.5,
        reason: 'Crédit de lancement',
        idempotencyKey: '00000000-0000-4000-8000-000000000099',
      }),
    });
    const response = await POST(request, { params: Promise.resolve({ tenantId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.balanceCredits).toBe(2.5);
    expect(mocks.postTenantCreditEntry).toHaveBeenCalledWith({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      tenantId,
      entryType: 'allocation',
      deltaMicrounits: 2_500_000,
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
      reason: 'Crédit de lancement',
    });
  });

  it('never mutates credits for a non-super-admin', async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    const request = new NextRequest(`https://qalem.ma/api/admin/tenants/${tenantId}/credits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params: Promise.resolve({ tenantId }) });
    expect(response.status).toBe(403);
    expect(mocks.postTenantCreditEntry).not.toHaveBeenCalled();
  });

  it('refuses an allocation with a negative amount', async () => {
    const request = new NextRequest(`https://qalem.ma/api/admin/tenants/${tenantId}/credits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entryType: 'allocation',
        amountCredits: -1,
        reason: 'Invalide',
        idempotencyKey: '00000000-0000-4000-8000-000000000099',
      }),
    });
    const response = await POST(request, { params: Promise.resolve({ tenantId }) });
    expect(response.status).toBe(400);
  });
});

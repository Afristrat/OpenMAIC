import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from '@/app/api/admin/tenants/route';
import { PATCH } from '@/app/api/admin/tenants/[tenantId]/route';

const tenantId = '00000000-0000-4000-8000-000000000049';

describe('platform tenant administration (S6-022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'root@qalem.ma' },
    });
    mocks.rpc.mockReturnValue({ single: mocks.single });
  });

  it('provisions a tenant with a named admin invitation and an explicit seat limit', async () => {
    mocks.single.mockResolvedValue({
      data: {
        id: tenantId,
        name: 'Institut Atlas',
        status: 'active',
        seat_limit: 12,
        invitation_token: 'one-time-token',
      },
      error: null,
    });
    const request = new NextRequest('https://qalem.ma/api/admin/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Institut Atlas',
        sector: 'education',
        defaultLocale: 'fr-FR',
        seatLimit: 12,
        administratorEmail: 'ADMIN@ATLAS.MA',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('provision_tenant_with_admin_invitation', {
      actor_user_id: '00000000-0000-4000-8000-000000000001',
      tenant_name: 'Institut Atlas',
      tenant_sector: 'education',
      tenant_locale: 'fr-FR',
      tenant_seat_limit: 12,
      administrator_email: 'admin@atlas.ma',
    });
    expect(body.administratorInvitationUrl).toBe(
      'https://qalem.ma/auth?invite=one-time-token',
    );
    expect(body.tenant).not.toHaveProperty('invitation_token');
  });

  it('never reaches the service role client for a non-super-admin', async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    const request = new NextRequest('https://qalem.ma/api/admin/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('updates suspension and seats through the audited atomic function', async () => {
    mocks.single.mockResolvedValue({
      data: { id: tenantId, status: 'suspended', seat_limit: 20 },
      error: null,
    });
    const request = new NextRequest(`https://qalem.ma/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'suspended', seatLimit: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ tenantId }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_tenant_controls', {
      actor_user_id: '00000000-0000-4000-8000-000000000001',
      tenant_id: tenantId,
      next_status: 'suspended',
      next_seat_limit: 20,
    });
  });

  it('returns a conflict instead of lowering seats below current occupancy', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: 'TENANT_SEAT_LIMIT_BELOW_OCCUPANCY' },
    });
    const request = new NextRequest(`https://qalem.ma/api/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seatLimit: 1 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ tenantId }) });

    expect(response.status).toBe(409);
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOrgMember: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireOrgMember: mocks.requireOrgMember }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));

import { DELETE, GET, POST } from '@/app/api/local/devices/route';

const orgId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const deviceKey = 'A'.repeat(43);

function request(method: string, body?: unknown) {
  return new NextRequest('https://qalem.ma/api/local/devices', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function existingDevice(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe('local device enrollment route (S2-012)', () => {
  beforeEach(() => {
    mocks.requireOrgMember.mockReset().mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createServiceSupabaseClient.mockReset();
  });

  it('fails closed before querying the service for malformed inputs', async () => {
    const response = await POST(request('POST', { orgId }));

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });

  it('does not let a device identifier replace its enrolled encryption key', async () => {
    const from = vi.fn().mockReturnValue(
      existingDevice({
        data: { id: 'device-row', encryption_public_key: 'B'.repeat(43), revoked_at: null },
        error: null,
      }),
    );
    mocks.createServiceSupabaseClient.mockReturnValue({ from });

    const response = await POST(
      request('POST', { orgId, deviceId, encryptionPublicKey: deviceKey, label: 'Téléphone' }),
    );

    expect(response.status).toBe(409);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('refuses a revoked device idempotently without touching its licences', async () => {
    const from = vi.fn().mockReturnValue(
      existingDevice({
        data: { id: 'device-row', revoked_at: '2026-09-14T00:00:00.000Z' },
        error: null,
      }),
    );
    mocks.createServiceSupabaseClient.mockReturnValue({ from });

    const response = await DELETE(request('DELETE', { orgId, deviceId }));

    expect(response.status).toBe(204);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('checks membership before listing an organization’s devices', async () => {
    mocks.requireOrgMember.mockResolvedValue({ response: new Response(null, { status: 403 }) });

    const response = await GET(
      new NextRequest(`https://qalem.ma/api/local/devices?orgId=${orgId}`),
    );

    expect(response.status).toBe(403);
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });
});

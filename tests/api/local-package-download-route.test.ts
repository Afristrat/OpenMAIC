import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOrgMember: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireOrgMember: mocks.requireOrgMember }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));

import { GET } from '@/app/api/local/packages/[packageId]/route';

const orgId = '11111111-1111-4111-8111-111111111111';
const packageId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';

function request() {
  return new NextRequest(
    `https://qalem.ma/api/local/packages/${packageId}?orgId=${orgId}&deviceId=${deviceId}`,
  );
}

function routeContext(id = packageId) {
  return { params: Promise.resolve({ packageId: id }) };
}

function singleResult(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  return query;
}

describe('local package download route (S2-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgMember.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('fails closed before authorization or storage for an invalid package identifier', async () => {
    const response = await GET(request(), routeContext('not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });

  it('does not query a package after an organization boundary refusal', async () => {
    mocks.requireOrgMember.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await GET(request(), routeContext());

    expect(response.status).toBe(403);
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });

  it('never downloads an artifact when no active license matches the user, tenant and device', async () => {
    const from = vi.fn().mockReturnValue(singleResult({ data: null, error: null }));
    const download = vi.fn();
    mocks.createServiceSupabaseClient.mockReturnValue({ from, storage: { from: vi.fn(() => ({ download })) } });

    const response = await GET(request(), routeContext());

    expect(response.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it('serves only the verified opaque package after matching license and enrolled device checks', async () => {
    const artifact = Buffer.from('{"format_version":1,"package":{},"key_envelope":{}}', 'utf8');
    const ciphertextSha256 = createHash('sha256').update(artifact).digest('hex');
    const from = vi
      .fn()
      .mockReturnValueOnce(
        singleResult({ data: { device_id: 'device-row' }, error: null }),
      )
      .mockReturnValueOnce(
        singleResult({ data: { artifact_path: `${orgId}/${packageId}.qalempkg`, ciphertext_sha256: ciphertextSha256 }, error: null }),
      )
      .mockReturnValueOnce(singleResult({ data: { id: 'device-row' }, error: null }));
    const download = vi.fn().mockResolvedValue({ data: new Blob([artifact]), error: null });
    mocks.createServiceSupabaseClient.mockReturnValue({
      from,
      storage: { from: vi.fn(() => ({ download })) },
    });

    const response = await GET(request(), routeContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Content-Disposition')).toContain('.qalempkg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(artifact);
    expect(download).toHaveBeenCalledWith(`${orgId}/${packageId}.qalempkg`);
  });
});

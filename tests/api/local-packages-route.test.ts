import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOrgMember: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  issueLocalPackage: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireOrgMember: mocks.requireOrgMember }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));
vi.mock('@/lib/server/local-content-crypto', () => ({
  LocalContentSigningConfigurationError: class LocalContentSigningConfigurationError extends Error {},
  issueLocalPackage: mocks.issueLocalPackage,
}));

import { POST } from '@/app/api/local/packages/route';

const orgId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';

function request(body: unknown) {
  return new NextRequest('https://qalem.ma/api/local/packages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('local package issuance route (S2-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgMember.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('fails closed before authorization or storage for malformed input', async () => {
    const response = await POST(request({ orgId }));

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });

  it('does not query sources or devices across a rejected organization boundary', async () => {
    mocks.requireOrgMember.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await POST(
      request({
        orgId,
        sourceId,
        deviceId,
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.issueLocalPackage).not.toHaveBeenCalled();
  });
});

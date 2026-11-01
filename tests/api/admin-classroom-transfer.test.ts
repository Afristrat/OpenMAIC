import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const STAGE_ID = 'stageAbc123';
const ORG_ID = '00000000-0000-4000-8000-000000000021';
const OWNER_ID = '00000000-0000-4000-8000-000000000022';
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from '@/app/api/admin/classrooms/[stageId]/transfer/route';

function request(body: unknown): NextRequest {
  return new NextRequest(`https://qalem.ma/api/admin/classrooms/${STAGE_ID}/transfer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = () => ({ params: Promise.resolve({ stageId: STAGE_ID }) });

describe('POST /api/admin/classrooms/[stageId]/transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({ user: { id: ACTOR_ID, email: 'root@qalem.ma' } });
    mocks.rpc.mockResolvedValue({ data: { stageId: STAGE_ID }, error: null });
  });

  it('refuses a caller who is not a super administrator before touching data', async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await POST(request({ toOrgId: ORG_ID, newOwnerId: OWNER_ID }), params());

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a body without valid organization and owner identifiers', async () => {
    const response = await POST(request({ toOrgId: 'nope', newOwnerId: OWNER_ID }), params());

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('transfers through the database function with the acting administrator', async () => {
    const response = await POST(request({ toOrgId: ORG_ID, newOwnerId: OWNER_ID }), params());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('transfer_classroom_to_organization', {
      p_actor: ACTOR_ID,
      p_stage: STAGE_ID,
      p_to_org: ORG_ID,
      p_new_owner: OWNER_ID,
    });
  });

  it.each([
    ['STAGE_NOT_FOUND', 404],
    ['SAME_ORGANIZATION', 409],
    ['TARGET_ORGANIZATION_INACTIVE', 409],
    ['NEW_OWNER_NOT_ELIGIBLE', 409],
    ['MULTIPLE_COURSES', 409],
  ])('maps the database refusal %s to HTTP %i', async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });

    const response = await POST(request({ toOrgId: ORG_ID, newOwnerId: OWNER_ID }), params());

    expect(response.status).toBe(status);
  });

  it('hides unknown database failures behind a generic 500', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await POST(request({ toOrgId: ORG_ID, newOwnerId: OWNER_ID }), params());

    expect(response.status).toBe(500);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const CLASSROOM = 'classroom_1';
const ORG_ID = '00000000-0000-4000-8000-000000000015';
const USER_ID = '6f39112d-851d-4d7d-a0a7-ca15a1013063';

const mocks = vi.hoisted(() => ({
  readClassroomOwnership: vi.fn(),
  requireSharer: vi.fn(),
  grantStageByEmail: vi.fn(),
  listStageGrants: vi.fn(),
  revokeStageGrant: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  readClassroomOwnership: mocks.readClassroomOwnership,
}));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgSharer: mocks.requireSharer }));
vi.mock('@/lib/server/stage-grants', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/stage-grants')>(
    '@/lib/server/stage-grants',
  );
  return {
    normalizeShareEmail: actual.normalizeShareEmail,
    grantStageByEmail: mocks.grantStageByEmail,
    listStageGrants: mocks.listStageGrants,
    revokeStageGrant: mocks.revokeStageGrant,
  };
});

import { DELETE, GET, POST } from '@/app/api/classroom/[classroomId]/grants/route';

const params = { params: Promise.resolve({ classroomId: CLASSROOM }) };

function request(method: string, body?: unknown) {
  return new NextRequest(`https://qalem.ma/api/classroom/${CLASSROOM}/grants`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'owner-1', orgId: ORG_ID });
  mocks.requireSharer.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@qalem.ma' } });
  mocks.grantStageByEmail.mockResolvedValue({ status: 'granted', userId: USER_ID });
  mocks.listStageGrants.mockResolvedValue([]);
  mocks.revokeStageGrant.mockResolvedValue(undefined);
});

describe('classroom grants route', () => {
  it.each([
    ['GET', () => GET(request('GET'), params)],
    ['POST', () => POST(request('POST', { email: 'a@b.co' }), params)],
    ['DELETE', () => DELETE(request('DELETE', { userId: USER_ID }), params)],
  ])('refuses %s to anyone who may not share, before touching the data', async (_m, call) => {
    mocks.requireSharer.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(mocks.requireSharer).toHaveBeenCalledWith(expect.any(NextRequest), ORG_ID, 'owner-1');
    expect(mocks.grantStageByEmail).not.toHaveBeenCalled();
    expect(mocks.listStageGrants).not.toHaveBeenCalled();
    expect(mocks.revokeStageGrant).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown classroom and 400 for an invalid id', async () => {
    mocks.readClassroomOwnership.mockResolvedValue(null);
    expect((await GET(request('GET'), params)).status).toBe(404);
    const bad = await GET(request('GET'), { params: Promise.resolve({ classroomId: '../x' }) });
    expect(bad.status).toBe(400);
  });

  it('grants by address and records the author of the share', async () => {
    const response = await POST(request('POST', { email: ' Personne@Exemple.MA ' }), params);
    expect(response.status).toBe(200);
    expect(mocks.grantStageByEmail).toHaveBeenCalledWith({
      stageId: CLASSROOM,
      email: 'personne@exemple.ma',
      grantedBy: 'admin-1',
    });
  });

  it('rejects an invalid address without any lookup', async () => {
    const response = await POST(request('POST', { email: 'pas-une-adresse' }), params);
    expect(response.status).toBe(400);
    expect(mocks.grantStageByEmail).not.toHaveBeenCalled();
  });

  it('tells the sharer when the address has no account', async () => {
    mocks.grantStageByEmail.mockResolvedValue({ status: 'no_account' });
    const response = await POST(request('POST', { email: 'a@b.co' }), params);
    expect(response.status).toBe(404);
  });

  it('revokes one person and rejects a malformed identifier', async () => {
    expect((await DELETE(request('DELETE', { userId: USER_ID }), params)).status).toBe(200);
    expect(mocks.revokeStageGrant).toHaveBeenCalledWith(CLASSROOM, USER_ID);
    expect((await DELETE(request('DELETE', { userId: 'x' }), params)).status).toBe(400);
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireOrgAdmin: vi.fn(),
  listMemberCredits: vi.fn(),
  setMemberCreditLimits: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireOrgAdmin: mocks.requireOrgAdmin }));
vi.mock('@/lib/server/member-credit-limits', () => ({
  listMemberCredits: mocks.listMemberCredits,
  setMemberCreditLimits: mocks.setMemberCreditLimits,
}));

const ORG = 'org-1';
const USER = '6f39112d-851d-4d7d-a0a7-ca15a1013063';
const ctx = { params: Promise.resolve({ orgId: ORG }) };

function put(body: unknown): NextRequest {
  return new Request(`http://localhost/api/organizations/${ORG}/credit-limits`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function get(): NextRequest {
  return new Request(
    `http://localhost/api/organizations/${ORG}/credit-limits`,
  ) as unknown as NextRequest;
}

// Cold module graphs are slow on a loaded machine; import once, outside the test timeouts.
beforeAll(async () => {
  await import('@/app/api/organizations/[orgId]/credit-limits/route');
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgAdmin.mockResolvedValue({ user: { id: 'admin-1', email: 'a@example.com' } });
  mocks.listMemberCredits.mockResolvedValue([]);
  mocks.setMemberCreditLimits.mockResolvedValue({ status: 'ok' });
});

describe('/api/organizations/[orgId]/credit-limits', () => {
  it('refuses a caller who is not an admin or manager of the organization', async () => {
    mocks.requireOrgAdmin.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { GET, PUT } = await import('@/app/api/organizations/[orgId]/credit-limits/route');
    expect((await GET(get(), ctx)).status).toBe(403);
    expect((await PUT(put({ limits: [{ userId: USER, capCredits: 5 }] }), ctx)).status).toBe(403);
    expect(mocks.listMemberCredits).not.toHaveBeenCalled();
    expect(mocks.setMemberCreditLimits).not.toHaveBeenCalled();
  });

  it('lists the members with their limit and monthly consumption', async () => {
    mocks.listMemberCredits.mockResolvedValue([
      { userId: USER, nickname: 'Test', role: 'author', capCredits: 5, spentCredits: 1.5 },
    ]);
    const { GET } = await import('@/app/api/organizations/[orgId]/credit-limits/route');
    const response = await GET(get(), ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { members: { capCredits: number }[] };
    expect(body.members[0].capCredits).toBe(5);
    expect(mocks.requireOrgAdmin).toHaveBeenCalledWith(expect.anything(), ORG);
  });

  it('rejects a negative, non numeric or empty request', async () => {
    const { PUT } = await import('@/app/api/organizations/[orgId]/credit-limits/route');
    expect((await PUT(put({ limits: [{ userId: USER, capCredits: -1 }] }), ctx)).status).toBe(400);
    expect((await PUT(put({ limits: [{ userId: 'x', capCredits: 1 }] }), ctx)).status).toBe(400);
    expect((await PUT(put({ limits: [] }), ctx)).status).toBe(400);
    expect(mocks.setMemberCreditLimits).not.toHaveBeenCalled();
  });

  it('sets a limit, a zero limit and clears another, in the name of the admin', async () => {
    const { PUT } = await import('@/app/api/organizations/[orgId]/credit-limits/route');
    const limits = [
      { userId: USER, capCredits: 0 },
      { userId: '11111111-1111-4111-8111-111111111111', capCredits: null },
    ];
    const response = await PUT(put({ limits }), ctx);
    expect(response.status).toBe(200);
    expect(mocks.setMemberCreditLimits).toHaveBeenCalledWith(ORG, limits, 'admin-1');
  });

  it('answers 404 when a user is not a member of the organization', async () => {
    mocks.setMemberCreditLimits.mockResolvedValue({ status: 'not-member', userId: USER });
    const { PUT } = await import('@/app/api/organizations/[orgId]/credit-limits/route');
    const response = await PUT(put({ limits: [{ userId: USER, capCredits: 3 }] }), ctx);
    expect(response.status).toBe(404);
  });
});

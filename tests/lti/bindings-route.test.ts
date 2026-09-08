import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/lti/bindings/route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));
const id = '00000000-0034-4000-8000-000000000001';
const orgId = '00000000-0034-4000-8000-000000000002';
const platform = { client_id: 'server-client', org_id: orgId };
const resource = { id, resource_link_id: 'assignment', stage_id: 'stage' };
function query(data: unknown, error: object | null = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  for (const method of [q.select, q.eq, q.insert, q.delete, q.order]) method.mockReturnValue(q);
  return q;
}
function request(body?: unknown) {
  return new NextRequest(
    `https://qalem.ma/api/lti/bindings?platformId=${id}&kind=resource`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { origin: 'https://qalem.ma', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}
const input = { platformId: id, kind: 'resource', resourceLinkId: 'assignment', stageId: 'stage' };
function context() {
  mocks.from.mockReturnValueOnce(query(platform)).mockReturnValueOnce(query({ id: orgId }));
}
describe('server-owned LTI binding administration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('LTI_APP_URL', 'https://qalem.ma');
    mocks.auth.mockResolvedValue({ user: { id } });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([GET, POST, DELETE])('requires super-admin before accessing bindings', async (method) => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await method(request(input))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('paginates tenant-scoped bindings and strips unrelated columns', async () => {
    context();
    const list = query(
      Array.from({ length: 101 }, () => ({ ...resource, private_extra: 'hidden' })),
    );
    mocks.from.mockReturnValueOnce(list);
    const response = await GET(request());
    const body = await response.json();
    expect(body.bindings).toHaveLength(100);
    expect(body.nextOffset).toBe(100);
    expect(body.bindings[0]).toEqual(resource);
    expect(list.eq).toHaveBeenCalledWith('org_id', orgId);
    expect(list.eq).toHaveBeenCalledWith('client_id', platform.client_id);
    expect(list.range).toHaveBeenCalledWith(0, 100);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('shows an unbound registration without inventing a tenant', async () => {
    mocks.from.mockReturnValueOnce(query({ ...platform, org_id: null }));
    expect(await (await GET(request())).json()).toEqual({
      orgId: null,
      bindings: [],
      nextOffset: null,
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('creates a resource only inside the registered tenant', async () => {
    context();
    const target = query({ id: 'stage' });
    const insert = query(resource);
    mocks.from.mockReturnValueOnce(target).mockReturnValueOnce(insert);
    expect((await POST(request(input))).status).toBe(201);
    expect(target.eq).toHaveBeenCalledWith('org_id', orgId);
    expect(insert.insert).toHaveBeenCalledWith({
      client_id: platform.client_id,
      org_id: orgId,
      resource_link_id: 'assignment',
      stage_id: 'stage',
    });
  });
  it('maps the opaque LMS subject only to an existing member, without provisioning', async () => {
    context();
    const target = query({ user_id: id });
    const insert = query({ id, lms_subject: 'opaque', user_id: id });
    mocks.from.mockReturnValueOnce(target).mockReturnValueOnce(insert);
    expect(
      (await POST(request({ platformId: id, kind: 'user', lmsSubject: 'opaque', userId: id })))
        .status,
    ).toBe(201);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'lti_registrations',
      'organizations',
      'org_members',
      'lti_user_bindings',
    ]);
    expect(target.eq).toHaveBeenCalledWith('org_id', orgId);
    expect(insert.insert).toHaveBeenCalledWith({
      client_id: platform.client_id,
      org_id: orgId,
      lms_subject: 'opaque',
      user_id: id,
    });
  });
  it('rejects client-owned tenant or identity metadata before database access', async () => {
    expect((await POST(request({ ...input, orgId }))).status).toBe(400);
    expect(
      (
        await POST(
          request({
            platformId: id,
            kind: 'user',
            lmsSubject: 'opaque',
            userId: id,
            email: 'x@example.org',
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects a foreign stage without writing', async () => {
    context();
    mocks.from.mockReturnValueOnce(query(null));
    expect((await POST(request(input))).status).toBe(403);
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['23505', 409],
    ['23503', 403],
    ['08006', 503],
  ])('handles insert failure %s without leaking details', async (code, status) => {
    context();
    mocks.from
      .mockReturnValueOnce(query({ id: 'stage' }))
      .mockReturnValueOnce(query(null, { code, message: 'private details' }));
    const response = await POST(request(input));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain('private details');
  });
  it('revokes only the exact binding owned by the registered platform and tenant', async () => {
    context();
    const remove = query({ id });
    mocks.from.mockReturnValueOnce(remove);
    expect(
      (await DELETE(request({ platformId: id, kind: 'resource', bindingId: id }))).status,
    ).toBe(200);
    expect(remove.eq.mock.calls).toEqual([
      ['id', id],
      ['client_id', platform.client_id],
      ['org_id', orgId],
    ]);
  });
  it('refuses revocation of an absent or foreign binding', async () => {
    context();
    mocks.from.mockReturnValueOnce(query(null));
    expect((await DELETE(request({ platformId: id, kind: 'user', bindingId: id }))).status).toBe(
      404,
    );
  });
});

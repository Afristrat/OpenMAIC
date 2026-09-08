import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/lti/platforms/route';
import { LtiNetworkPolicyError } from '@/lib/lti/network';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), ssrf: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/lti/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lti/network')>()),
  resolveLtiEndpoint: mocks.ssrf,
}));
const orgId = '00000000-0034-4000-8000-000000000001';
const input = {
  orgId,
  clientId: 'client',
  deploymentId: 'deployment',
  issuer: 'https://lms.example',
  jwksUrl: 'https://lms.example/jwks',
  authUrl: 'https://lms.example/auth',
  tokenUrl: 'https://lms.example/token',
};
const row = {
  id: orgId,
  org_id: orgId,
  client_id: input.clientId,
  deployment_id: input.deploymentId,
  issuer: input.issuer,
  jwks_url: input.jwksUrl,
  auth_url: input.authUrl,
  token_url: input.tokenUrl,
};
function query(data: unknown, error: object | null = null) {
  const q = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    is: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  q.select.mockReturnValue(q);
  q.insert.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.is.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}
function request(body: unknown = input, origin = 'https://qalem.ma') {
  return new NextRequest('https://qalem.ma/api/lti/platforms', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('persistent LTI platform administration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('LTI_APP_URL', 'https://qalem.ma');
    mocks.auth.mockResolvedValue({ user: { id: orgId } });
    mocks.ssrf.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([GET, POST, PATCH])('requires super-admin before database access', async (method) => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await method(request())).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('lists persisted registrations without exposing unrelated columns', async () => {
    mocks.from.mockReturnValue(query([{ ...row, private_extra: 'not returned' }]));
    const response = await GET(request());
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual([{ id: orgId, ...input }]);
  });
  it('creates only for an active explicit tenant and returns the database ID', async () => {
    const insert = query(row);
    mocks.from.mockReturnValueOnce(query({ id: orgId })).mockReturnValueOnce(insert);
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: orgId, ...input });
    expect(insert.insert).toHaveBeenCalledWith({
      org_id: orgId,
      client_id: input.clientId,
      deployment_id: input.deploymentId,
      issuer: input.issuer,
      jwks_url: input.jwksUrl,
      auth_url: input.authUrl,
      token_url: input.tokenUrl,
    });
  });
  it.each([
    { ...input, orgId: '' },
    { ...input, tokenUrl: 'http://lms.example' },
    { ...input, jwksUrl: 'https://user:password@lms.example' },
  ])('rejects invalid registration input', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects private network endpoints even on a self-hosted instance', async () => {
    mocks.ssrf.mockRejectedValue(new LtiNetworkPolicyError());
    expect((await POST(request())).status).toBe(400);
    expect(mocks.ssrf).toHaveBeenCalledWith(input.jwksUrl, expect.any(AbortSignal));
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('reports DNS unavailability without persisting an unverified registration', async () => {
    mocks.ssrf.mockRejectedValue(new Error('private resolver details'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private resolver details');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects unknown or inactive tenants', async () => {
    mocks.from.mockReturnValue(query(null));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('reports duplicate registration without an optimistic success', async () => {
    mocks.from
      .mockReturnValueOnce(query({ id: orgId }))
      .mockReturnValueOnce(query(null, { code: '23505' }));
    expect((await POST(request())).status).toBe(409);
  });
  it('refuses cross-origin and oversized bodies before persistence', async () => {
    expect((await POST(request(input, 'https://other.example'))).status).toBe(403);
    expect((await POST(request({ ...input, clientId: 'a'.repeat(65536) }))).status).toBe(413);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('attaches only the exact unbound registration', async () => {
    const update = query(row);
    mocks.from.mockReturnValueOnce(query({ id: orgId })).mockReturnValueOnce(update);
    const response = await PATCH(request({ platformId: row.id, orgId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: orgId, ...input });
    expect(update.update).toHaveBeenCalledWith({ org_id: orgId });
    expect(update.eq).toHaveBeenCalledWith('id', row.id);
    expect(update.is).toHaveBeenCalledWith('org_id', null);
  });
  it.each([
    { current: row, status: 200 },
    { current: { ...row, org_id: '00000000-0034-4000-8000-000000000002' }, status: 409 },
    { current: null, status: 404 },
  ])(
    'handles replay, concurrent foreign assignment and absence: $status',
    async ({ current, status }) => {
      mocks.from
        .mockReturnValueOnce(query({ id: orgId }))
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(current));
      expect((await PATCH(request({ platformId: row.id, orgId }))).status).toBe(status);
      expect(mocks.from).toHaveBeenCalledTimes(3);
    },
  );
  it('refuses invalid assignment, extra fields and foreign origins before persistence', async () => {
    for (const body of [
      { platformId: 'invalid', orgId },
      { platformId: row.id, orgId, clientId: 'other' },
    ])
      expect((await PATCH(request(body))).status).toBe(400);
    expect(
      (await PATCH(request({ platformId: row.id, orgId }, 'https://other.example'))).status,
    ).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not attach to an inactive tenant or claim success after a database error', async () => {
    mocks.from.mockReturnValueOnce(query(null));
    expect((await PATCH(request({ platformId: row.id, orgId }))).status).toBe(403);
    mocks.from
      .mockReturnValueOnce(query({ id: orgId }))
      .mockReturnValueOnce(query(null, { message: 'private database details' }));
    const response = await PATCH(request({ platformId: row.id, orgId }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database details');
  });
});

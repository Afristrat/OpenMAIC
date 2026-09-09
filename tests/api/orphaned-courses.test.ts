import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  gt: vi.fn(),
  result: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));
import { GET } from '@/app/api/courses/orphaned/route';
const orgId = '00000000-0036-4000-8000-000000000144';
const id = '00000000-0036-4000-8000-000000000149';
const request = (after?: string) =>
  new NextRequest(
    `http://localhost/api/courses/orphaned?orgId=${orgId}${after ? `&after=${after}` : ''}`,
  );
describe('orphaned course discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'verified' } });
    const query = {
      select: () => query,
      eq: mocks.eq,
      is: mocks.is,
      gt: mocks.gt,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      abortSignal: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        mocks.result().then(resolve, reject),
    };
    for (const mock of [mocks.from, mocks.eq, mocks.is, mocks.gt]) mock.mockReturnValue(query);
    mocks.result.mockReset();
    mocks.result
      .mockResolvedValueOnce({ data: { role: 'admin' } })
      .mockResolvedValue({ data: [{ id, title: 'Draft', status: 'draft', stage_id: null }] });
  });
  it('requires authentication before querying', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('requires an actual active tenant admin, not a client role', async () => {
    mocks.result.mockReset().mockResolvedValue({ data: null });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'verified');
    expect(mocks.eq).toHaveBeenCalledWith('role', 'admin');
    expect(mocks.eq).toHaveBeenCalledWith('organizations.status', 'active');
    expect(mocks.from).not.toHaveBeenCalledWith('courses');
  });
  it('includes drafts, filters tenant and missing owner, and returns private results', async () => {
    const response = await GET(request(id));
    expect(response.status).toBe(200);
    expect((await response.json()).courses[0].status).toBe('draft');
    expect(mocks.eq).toHaveBeenCalledWith('org_id', orgId);
    expect(mocks.is).toHaveBeenCalledWith('owner_id', null);
    expect(mocks.gt).toHaveBeenCalledWith('id', id);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('provides a continuation instead of silently truncating', async () => {
    mocks.result
      .mockReset()
      .mockResolvedValueOnce({ data: { role: 'admin' } })
      .mockResolvedValueOnce({ data: Array.from({ length: 51 }, (_, i) => ({ id: `${i}` })) });
    const body = await (await GET(request())).json();
    expect(body.courses).toHaveLength(50);
    expect(body.nextCursor).toBe('49');
  });
  it('fails closed on database errors', async () => {
    mocks.result.mockReset().mockResolvedValue({ error: { message: 'private details' } });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private details');
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.client }));
import { GET } from '@/app/api/marketplace/agents/owned/route';
const request = (query = '') => new NextRequest(`https://qalem.ma/api/marketplace/agents/owned${query}`);
beforeEach(() => vi.resetAllMocks());

it('refuses anonymous requests and injected identities without querying the store', async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
  expect((await GET(request())).status).toBe(401);
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  for (const query of ['?owner_id=foreign', '?orgId=foreign', '?page=0', '?page=NaN', '?page=9999999']) {
    expect((await GET(request(query))).status).toBe(400);
  }
  expect(mocks.client).not.toHaveBeenCalled();
});

it('lists only the session owner, including withdrawn publications without a tenant', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [
      { id: 'published', name: 'A', org_id: 'tenant', is_published: true, description: null, tags: [] },
      { id: 'withdrawn', name: 'B', org_id: null, is_published: false, description: null, tags: null },
    ], count: 52, error: null }),
  };
  mocks.client.mockResolvedValue({ from: () => query });
  const response = await GET(request('?page=2'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(query.eq).toHaveBeenCalledExactlyOnceWith('owner_id', 'owner');
  expect(query.range).toHaveBeenCalledWith(50, 99);
  expect(await response.json()).toMatchObject({
    agents: [{ id: 'published', published: true }, { id: 'withdrawn', orgId: null, published: false }],
    pagination: { page: 2, total: 52, totalPages: 2 },
  });
  query.range.mockResolvedValue({ data: null, count: null, error: { message: 'private database error' } });
  const failed = await GET(request());
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain('private database error');
});

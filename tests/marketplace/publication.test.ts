import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ client: vi.fn(), authorize: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.client }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAuthor: mocks.authorize }));
import { POST } from '@/app/api/marketplace/agents/route';
import { marketplacePublishSchema } from '@/lib/api/schemas';

beforeEach(() => vi.resetAllMocks());

function fixture(owner = 'owner', org: string | null = 'org') {
  const update = vi.fn();
  const read = { id: 'agent', owner_id: owner, org_id: org };
  const result = vi
    .fn()
    .mockResolvedValue({ data: { id: 'agent', is_published: true }, error: null });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: read, error: null }),
    maybeSingle: result,
    update: update.mockReturnThis(),
  };
  mocks.client.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => query,
  });
  mocks.authorize.mockResolvedValue({ user: { id: 'owner' } });
  return { update, result, query };
}

function request(body: unknown) {
  return new NextRequest('https://qalem.ma/api/marketplace/agents', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

it('accepts the empty description emitted by the UI and bounds metadata', () => {
  expect(marketplacePublishSchema.parse({ agentId: 'agent', description: null }).isPublished).toBe(
    true,
  );
  expect(marketplacePublishSchema.safeParse({ agentId: ' ', tags: [''] }).success).toBe(false);
  expect(
    marketplacePublishSchema.safeParse({ agentId: 'agent', tags: Array(21).fill('tag') }).success,
  ).toBe(false);
});

it('publishes only the owned agent after checking its stored tenant', async () => {
  const { update, query } = fixture();
  expect((await POST(request({ agentId: 'agent', description: null }))).status).toBe(200);
  expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), 'org', { requireMembership: true });
  expect(update).toHaveBeenCalledWith({ is_published: true, description: null });
  expect(query.eq).toHaveBeenCalledWith('owner_id', 'owner');
  expect(query.eq).toHaveBeenCalledWith('org_id', 'org');
});

it('refuses foreign ownership and revoked organization access before writing', async () => {
  let state = fixture('another-owner');
  expect((await POST(request({ agentId: 'agent' }))).status).toBe(403);
  expect(state.update).not.toHaveBeenCalled();
  state = fixture();
  mocks.authorize.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await POST(request({ agentId: 'agent' }))).status).toBe(403);
  expect(state.update).not.toHaveBeenCalled();
});

it('allows withdrawal by the owner and never reports success for a vanished row', async () => {
  const { update, result } = fixture('owner', null);
  result.mockResolvedValue({ data: { id: 'agent', is_published: false }, error: null });
  const response = await POST(request({ agentId: 'agent', isPublished: false }));
  expect(await response.json()).toMatchObject({ success: true, published: false });
  expect(update).toHaveBeenCalledWith({ is_published: false });
  expect(mocks.authorize).not.toHaveBeenCalled();
  result.mockResolvedValue({ data: null, error: null });
  expect((await POST(request({ agentId: 'agent', isPublished: false }))).status).toBe(409);
});

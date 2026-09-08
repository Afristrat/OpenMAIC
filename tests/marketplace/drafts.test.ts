import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAuthor: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.client }));
import { POST } from '@/app/api/marketplace/agents/drafts/route';

const payload = {
  orgId: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000003',
  agent: { name: 'Analyste', role: 'student', persona: 'Analyse les situations.',
    color: '#112233', priority: 5, allowedActions: ['wb_open'], avatar: '/avatars/teacher-2.png' },
};
function request(body: unknown = payload) {
  return new NextRequest('https://qalem.ma/api/marketplace/agents/drafts', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => vi.resetAllMocks());

it('refuses tenant access before writing and rejects ownership injected by the browser', async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
  expect((await POST(request({ ...payload, owner_id: 'foreign' }))).status).toBe(400);
});

it('persists a private snapshot idempotently with server-derived owner and tenant', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'saved', is_published: false }, error: null }) };
  mocks.client.mockResolvedValue({ from: () => ({ upsert: insert, ...query }) });
  expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(200);
  const row = insert.mock.calls[0][0];
  expect(insert.mock.calls[1][0].id).toBe(row.id);
  expect(row).toMatchObject({ owner_id: 'owner', org_id: payload.orgId, is_published: false });
  expect(insert.mock.calls[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  expect(query.eq).toHaveBeenCalledWith('owner_id', 'owner');
  mocks.auth.mockResolvedValue({ user: { id: 'other' } });
  await POST(request());
  expect(insert.mock.calls[2][0].id).not.toBe(row.id);
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await POST(request())).status).toBe(500);
});

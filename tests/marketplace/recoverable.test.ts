import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.service }));
import { GET, POST } from '@/app/api/marketplace/agents/recoverable/route';
const orgId = '00000000-0036-4000-8000-000000000423';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
  mocks.auth.mockResolvedValue({ user: { id: 'verified-user' } });
  mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: 'agent-1', error: null });
});
afterEach(() => vi.unstubAllEnvs());
const post = (body: object = { orgId, agentId: 'agent-1' }, origin = 'https://qalem.ma') =>
  POST(
    new NextRequest('https://qalem.ma/api/marketplace/agents/recoverable', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
it('requires Auth and same origin before privileged access', async () => {
  mocks.auth.mockResolvedValueOnce({ response: NextResponse.json({}, { status: 401 }) });
  expect((await post()).status).toBe(401);
  expect((await post(undefined, 'https://foreign.example')).status).toBe(403);
  expect(mocks.service).not.toHaveBeenCalled();
});
it('uses only the verified actor and requires the exact claimed identity', async () => {
  const response = await post();
  expect(await response.json()).toEqual({ success: true, reclaimed: true, agentId: 'agent-1' });
  expect(mocks.rpc).toHaveBeenCalledWith('reclaim_detached_tenant_agent', {
    p_actor: 'verified-user',
    p_org: orgId,
    p_agent: 'agent-1',
  });
  expect(mocks.service).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(response.headers.get('cache-control')).toContain('no-store');
  mocks.rpc.mockResolvedValueOnce({ data: 'other-agent' });
  expect((await post()).status).toBe(409);
  expect((await post({ orgId, agentId: 'agent-1', ownerId: 'attacker' })).status).toBe(400);
});
it('does not retry an ambiguous mutation or expose backend details', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('private backend information'));
  const response = await post();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('lists bounded metadata only and distinguishes forbidden access from an empty result', async () => {
  const req = new NextRequest(`https://qalem.ma/api/marketplace/agents/recoverable?orgId=${orgId}`);
  mocks.rpc.mockResolvedValueOnce({
    data: {
      agents: [{ id: 'agent-1', name: 'Recoverable', persona: 'not-listable' }],
      nextCursor: null,
    },
  });
  const response = await GET(req);
  expect(await response.json()).toEqual({
    success: true,
    agents: [{ id: 'agent-1', name: 'Recoverable' }],
    nextCursor: null,
  });
  mocks.rpc.mockResolvedValueOnce({ data: null });
  expect((await GET(req)).status).toBe(403);
});

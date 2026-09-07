import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), health: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.auth }));
vi.mock('@/lib/mcp/runtime', () => ({ getMCPHealth: mocks.health }));
import { GET } from '@/app/api/admin/mcp/route';

beforeEach(() => vi.resetAllMocks());

it('does not initialize or probe servers for an unauthorized caller', async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await GET(new NextRequest('https://qalem.ma/api/admin/mcp'))).status).toBe(403);
  expect(mocks.health).not.toHaveBeenCalled();
});

it('returns fresh health only to a super-administrator and hides upstream exceptions', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
  mocks.health.mockResolvedValue([{ id: 'docs', name: 'Docs', status: 'connected', toolCount: 1 }]);
  const response = await GET(new NextRequest('https://qalem.ma/api/admin/mcp'));
  expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  expect(await response.json()).toEqual({
    success: true,
    servers: [{ id: 'docs', name: 'Docs', status: 'connected', toolCount: 1 }],
  });
  mocks.health.mockRejectedValue(new Error('private upstream diagnostics'));
  const failure = await GET(new NextRequest('https://qalem.ma/api/admin/mcp'));
  expect(failure.status).toBe(502);
  expect(await failure.text()).not.toContain('private upstream diagnostics');
});

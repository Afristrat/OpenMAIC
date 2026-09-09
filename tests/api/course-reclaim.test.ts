import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), result: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
import { POST } from '@/app/api/courses/[courseId]/reclaim/route';
const courseId = '00000000-0036-4000-8000-000000000149';
const request = (origin = 'http://localhost') =>
  POST(
    new NextRequest('http://localhost/api/courses/test/reclaim?actor=attacker', {
      method: 'POST',
      headers: { origin },
    }),
    { params: Promise.resolve({ courseId }) },
  );
describe('course takeover endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.auth.mockResolvedValue({ user: { id: 'verified-actor' } });
    mocks.rpc.mockReturnValue({ abortSignal: mocks.result });
    mocks.result.mockResolvedValue({ data: { courseId, sourceManifestId: null }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires authentication', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await request()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects a foreign origin before mutation', async () => {
    expect((await request('https://foreign.test')).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('passes only the verified identity and validates the result', async () => {
    const response = await request();
    expect(await response.json()).toEqual({ courseId, sourceManifestId: null });
    expect(mocks.rpc).toHaveBeenCalledWith('reclaim_orphaned_course', {
      p_actor: 'verified-actor',
      p_course: courseId,
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('keeps authorization failures opaque', async () => {
    mocks.result.mockResolvedValue({ error: { code: '42501', message: 'private details' } });
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('private');
  });
  it('does not certify an invalid response', async () => {
    mocks.result.mockResolvedValue({ data: {}, error: null });
    expect((await request()).status).toBe(503);
  });
});

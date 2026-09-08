import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/lti/context/route';
import { LtiAccessDenied } from '@/lib/lti/context';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/lti/context', async (original) => ({
  ...(await original<typeof import('@/lib/lti/context')>()),
  resolveLtiContext: mocks.resolve,
}));
function request(cookie = true) {
  return new NextRequest('https://qalem.ma/api/lti/context?stageId=stage', {
    headers: cookie ? { cookie: `lti_context=${'a'.repeat(64)}` } : {},
  });
}
describe('LTI context route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'verified-user' } });
  });
  it('requires authentication even with a cookie', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('returns ordinary classroom mode only when the cookie is absent', async () => {
    expect(await (await GET(request(false))).json()).toEqual({ success: true, active: false });
  });
  it('returns no identity, endpoint, token or answer key and prevents caching', async () => {
    mocks.resolve.mockResolvedValue({
      gradingEnabled: true,
      orgId: 'private',
      sessionId: 'private',
    });
    const result = await GET(request());
    expect(await result.json()).toEqual({ success: true, active: true, gradingEnabled: true, launchId: 'private' });
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.resolve).toHaveBeenCalledWith({
      token: 'a'.repeat(64),
      userId: 'verified-user',
      stageId: 'stage',
    });
  });
  it.each([
    [new LtiAccessDenied(), 403],
    [new Error('private error'), 503],
  ] as const)(
    'does not silently downgrade failed LTI context to ordinary grading',
    async (error, status) => {
      mocks.resolve.mockRejectedValue(error);
      const result = await GET(request());
      expect(result.status).toBe(status);
      expect(await result.json()).toEqual({ success: false, error: 'LTI context unavailable' });
    },
  );
});

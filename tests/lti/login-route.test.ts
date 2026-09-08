import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/lti/login/route';
import { getPlatformConfig, getPlatformConfigByIssuer, storeNonce } from '@/lib/lti';

vi.mock('@/lib/lti', () => ({ getPlatformConfig: vi.fn(), getPlatformConfigByIssuer: vi.fn(), storeNonce: vi.fn() }));
const platform = {
  id: 'registration', clientId: 'client', issuer: 'https://lms.example.org',
  deploymentId: 'deployment', authUrl: 'https://lms.example.org/auth?tenant=registered',
  jwksUrl: 'https://lms.example.org/jwks', tokenUrl: 'https://lms.example.org/token',
};
const defaults = { iss: platform.issuer, client_id: platform.clientId,
  login_hint: 'learner', target_link_uri: 'https://qalem.ma/classroom/course' };

function request(overrides: Record<string, string> = {}, method = 'GET') {
  const params = new URLSearchParams({ ...defaults, ...overrides });
  return new NextRequest(`https://qalem.ma/api/lti/login${method === 'GET' ? `?${params}` : ''}`, {
    method, ...(method === 'POST' ? { body: params.toString() } : {}),
  });
}

describe('LTI login registration boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('LTI_APP_URL', 'https://qalem.ma');
    vi.mocked(getPlatformConfig).mockResolvedValue(platform);
    vi.mocked(getPlatformConfigByIssuer).mockResolvedValue(platform);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['https://qalem.ma.evil.example/course', 'https://qalem.ma@evil.example/course',
    'https://qalem.ma:444/course', 'https://user@qalem.ma/course', 'https://qalem.ma/course#fragment', 'invalid'])('rejects a foreign or malformed target before nonce storage: %s', async (target_link_uri) => {
    expect((await GET(request({ target_link_uri }))).status).toBe(400);
    expect(storeNonce).not.toHaveBeenCalled();
  });
  it('does not fall back when an explicit client is unknown', async () => {
    vi.mocked(getPlatformConfig).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(403);
    expect(getPlatformConfigByIssuer).not.toHaveBeenCalled();
    expect(storeNonce).not.toHaveBeenCalled();
  });
  it.each([{ iss: 'https://other.example.org' }, { lti_deployment_id: 'other' }])('rejects contradictory registration fields', async (overrides) => {
    expect((await GET(request(overrides))).status).toBe(403);
    expect(storeNonce).not.toHaveBeenCalled();
  });
  it('uses a GET redirect after POST and preserves registered authorization parameters', async () => {
    const response = await POST(request({}, 'POST'));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('tenant')).toBe('registered');
    expect(location.searchParams.get('redirect_uri')).toBe('https://qalem.ma/api/lti/launch');
    expect(location.searchParams.get('client_id')).toBe('client');
    expect(storeNonce).toHaveBeenCalledWith(location.searchParams.get('nonce'), 'client');
  });
});

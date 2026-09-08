import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/lti/launch/route';
import { consumeNonce, getPlatformConfig, verifyLTIToken } from '@/lib/lti';
import { resolveLaunchBindings } from '@/lib/lti/bindings';
import { establishLaunchSession } from '@/lib/lti/session';
import { loginContextNonce } from '@/lib/lti/login-context';

vi.mock('@/lib/lti', () => ({
  consumeNonce: vi.fn(), getPlatformConfig: vi.fn(), verifyLTIToken: vi.fn(),
}));
vi.mock('@/lib/lti/bindings', () => ({ resolveLaunchBindings: vi.fn() }));
vi.mock('@/lib/lti/session', () => ({ establishLaunchSession: vi.fn() }));

const platform = {
  id: 'registration', clientId: 'client', issuer: 'https://lms.example.org',
  deploymentId: 'deployment', authUrl: 'https://lms.example.org/auth',
  jwksUrl: 'https://lms.example.org/jwks', tokenUrl: 'https://lms.example.org/token',
};
const target = 'https://qalem.ma/api/lti/launch';
const state = 'random-browser-state';
const launch = {
  userId: 'subject', resourceLinkId: 'resource', deploymentId: 'deployment',
  roles: [], agsScopes: [], targetLinkUri: target,
  nonce: loginContextNonce(state, platform.clientId, target),
};
function request() {
  return new NextRequest('https://qalem.ma/api/lti/launch', {
    method: 'POST', headers: { cookie: `lti_state=${state}; lti_client_id=client` },
    body: new URLSearchParams({ state, id_token: 'signed.jwt.token' }),
  });
}

describe('LTI launch login context', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('LTI_APP_URL', 'https://qalem.ma');
    vi.mocked(getPlatformConfig).mockResolvedValue(platform);
    vi.mocked(verifyLTIToken).mockResolvedValue(launch);
    vi.mocked(consumeNonce).mockResolvedValue(true);
    vi.mocked(resolveLaunchBindings).mockResolvedValue({
      clientId: 'client', orgId: 'org', stageId: 'course', userId: 'user',
      lmsSubject: 'subject', resourceBindingId: 'resource', userBindingId: 'binding',
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { targetLinkUri: `${target}?different=1` },
    { targetLinkUri: 'https://qalem.ma:443/api/lti/launch' },
    { targetLinkUri: undefined },
    { nonce: loginContextNonce('other-state', 'client', target) },
    { nonce: loginContextNonce(state, 'other-client', target) },
  ])('rejects substituted signed context before nonce consumption and Auth', async (change) => {
    vi.mocked(verifyLTIToken).mockResolvedValue({ ...launch, ...change });
    expect((await POST(request())).status).toBe(401);
    expect(consumeNonce).not.toHaveBeenCalled();
    expect(resolveLaunchBindings).not.toHaveBeenCalled();
    expect(establishLaunchSession).not.toHaveBeenCalled();
  });
  it('still rejects an unissued or already consumed matching nonce', async () => {
    vi.mocked(consumeNonce).mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(establishLaunchSession).not.toHaveBeenCalled();
  });
  it('opens only the bound classroom after single-use verification and clears login cookies', async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://qalem.ma/classroom/course');
    expect(consumeNonce).toHaveBeenCalledWith(launch.nonce, 'client');
    expect(establishLaunchSession).toHaveBeenCalledOnce();
    expect(response.cookies.get('lti_state')?.value).toBe('');
    expect(response.cookies.get('lti_client_id')?.value).toBe('');
  });
});

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { establishLaunchSession } from '@/lib/lti/session';
import type { LTILaunchContext } from '@/lib/lti/types';

const mocks = vi.hoisted(() => ({ account: vi.fn(), link: vi.fn(), verify: vi.fn(), signOut: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => ({
  auth: { admin: { getUserById: mocks.account, generateLink: mocks.link } },
  from: () => ({ insert: mocks.insert }),
}) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { verifyOtp: mocks.verify, signOut: mocks.signOut } }) }));
const binding = { userId: 'qalem-user', orgId: 'tenant', stageId: 'stage', clientId: 'client',
  resourceBindingId: 'resource', userBindingId: 'identity', lmsSubject: 'opaque-subject' };
const launch: LTILaunchContext = { userId: 'opaque-subject', nonce: 'nonce',
  email: 'untrusted@example.org', roles: [], resourceLinkId: 'assignment',
  deploymentId: 'deployment', agsScopes: ['score'], lineItemUrl: 'https://lms.example.org/item' };

describe('LTI SSO and durable context', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.org');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-fixture');
    mocks.account.mockResolvedValue({ data: { user: { id: binding.userId, email: 'registered@example.org' } }, error: null });
    mocks.link.mockResolvedValue({ data: { user: { id: binding.userId }, properties: { hashed_token: 'test-otp' } }, error: null });
    mocks.verify.mockResolvedValue({ data: { user: { id: binding.userId }, session: {} }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('uses the registered account and stores only the hash of the context cookie', async () => {
    const response = NextResponse.redirect('https://qalem.ma/classroom/stage', 303);
    await establishLaunchSession(new NextRequest('https://qalem.ma/api/lti/launch'), response, binding, launch);
    expect(mocks.link).toHaveBeenCalledWith({ type: 'magiclink', email: 'registered@example.org' });
    const cookie = response.cookies.get('lti_context');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400 });
    expect(cookie?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      token_hash: createHash('sha256').update(cookie!.value).digest('hex'),
      resource_binding_id: binding.resourceBindingId, user_binding_id: binding.userBindingId,
    }));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('refuses an account switched during link generation', async () => {
    mocks.link.mockResolvedValue({ data: { user: { id: 'foreign' }, properties: { hashed_token: 'test' } }, error: null });
    await expect(establishLaunchSession(new NextRequest('https://qalem.ma'), NextResponse.next(), binding, launch)).rejects.toThrow('unavailable');
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('revokes a session if the verified identity does not match', async () => {
    mocks.verify.mockResolvedValue({ data: { user: { id: 'foreign' }, session: {} }, error: null });
    await expect(establishLaunchSession(new NextRequest('https://qalem.ma'), NextResponse.next(), binding, launch)).rejects.toThrow('failed');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' }); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not issue an LTI cookie when persistence fails and revokes the new session', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23503' } });
    const response = NextResponse.next();
    await expect(establishLaunchSession(new NextRequest('https://qalem.ma'), response, binding, launch)).rejects.toThrow('persistence failed');
    expect(response.cookies.get('lti_context')).toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

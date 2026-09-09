import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), deleteUser: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.service }));
import { DELETE } from '@/app/api/account/delete/route';

const request = (origin: string | null = 'http://localhost') =>
  new NextRequest('http://localhost/api/account/delete?userId=other-user', {
    method: 'DELETE',
    headers: origin ? { origin } : {},
  });

describe('account deletion boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.auth.mockResolvedValue({ user: { id: 'verified-user' } });
    // No .from(): tables must never be deleted independently before Auth.
    mocks.service.mockReturnValue({ auth: { admin: { deleteUser: mocks.deleteUser } } });
    mocks.deleteUser.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires authentication before privileged access', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await DELETE(request())).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each([null, 'https://other.example'])('rejects untrusted origin %s', async (origin) => {
    expect((await DELETE(request(origin))).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it('deletes only the verified account with one hard-delete call', async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, accountDeleted: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith('verified-user', false);
  });

  it('does not certify deletion after a database restriction', async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: 'private constraint detail' } });
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Account deletion could not be confirmed' });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('does not retry an ambiguous failure or expose its details', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('private transport detail'));
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });
});

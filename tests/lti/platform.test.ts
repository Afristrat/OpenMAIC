import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlatformConfig, getPlatformConfigByIssuer } from '@/lib/lti';
const mocks = vi.hoisted(() => ({ eq: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }),
}));
describe('LTI platform lookup failures', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.eq.mockReturnValue({ maybeSingle: mocks.lookup }); });
  it.each([getPlatformConfig, getPlatformConfigByIssuer])('distinguishes missing registrations from database failures', async (lookup) => {
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    expect(await lookup('fixture')).toBeNull();
    mocks.lookup.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    await expect(lookup('fixture')).rejects.toThrow('LTI platform lookup unavailable');
  });
  it('maps the registered platform without exposing unrelated columns', async () => {
    mocks.lookup.mockResolvedValue({ data: { id: 'id', client_id: 'client', issuer: 'issuer',
      jwks_url: 'jwks', auth_url: 'auth', token_url: 'token', deployment_id: 'deployment' }, error: null });
    expect(await getPlatformConfig('client')).toEqual({ id: 'id', clientId: 'client', issuer: 'issuer',
      jwksUrl: 'jwks', authUrl: 'auth', tokenUrl: 'token', deploymentId: 'deployment' });
    expect(mocks.eq).toHaveBeenCalledWith('client_id', 'client');
  });
});

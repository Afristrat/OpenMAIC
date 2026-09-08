import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLaunchBindings } from '@/lib/lti/bindings';
import { parseVerifiedLaunchClaims } from '@/lib/lti/launch-claims';
import { LTI_CLAIMS } from '@/lib/lti/types';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));
const orgId = '00000000-0034-4000-8000-000000000001';
const userId = '00000000-0034-4000-8000-000000000002';
const platform = {
  id: 'platform',
  clientId: 'client',
  issuer: 'https://lms.example.org',
  deploymentId: 'deployment',
  authUrl: 'https://lms.example.org/auth',
  tokenUrl: 'https://lms.example.org/token',
  jwksUrl: 'https://lms.example.org/jwks',
};
const launch = parseVerifiedLaunchClaims(
  {
    sub: 'opaque-subject',
    nonce: 'nonce',
    aud: 'client',
    email: 'untrusted@example.org',
    [LTI_CLAIMS.MESSAGE_TYPE]: 'LtiResourceLinkRequest',
    [LTI_CLAIMS.VERSION]: '1.3.0',
    [LTI_CLAIMS.DEPLOYMENT_ID]: 'deployment',
    [LTI_CLAIMS.TARGET_LINK_URI]: 'https://qalem.ma/classroom/fixture',
    [LTI_CLAIMS.RESOURCE_LINK]: { id: 'assignment' },
    [LTI_CLAIMS.ROLES]: [],
  },
  platform,
);
function lookup(data: unknown, error: object | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe('registered LTI launch bindings', () => {
  beforeEach(() => mocks.from.mockReset());
  it('resolves opaque LMS identity to an existing Qalem member without using email', async () => {
    const resource = lookup({ id: orgId, org_id: orgId, stage_id: 'stage' });
    const identity = lookup({ id: userId, org_id: orgId, user_id: userId });
    mocks.from
      .mockReturnValueOnce(resource)
      .mockReturnValueOnce(identity)
      .mockReturnValueOnce(lookup({ id: orgId }))
      .mockReturnValueOnce(lookup({ user_id: userId }));
    expect(await resolveLaunchBindings(platform, launch)).toMatchObject({
      userId,
      orgId,
      stageId: 'stage',
      lmsSubject: 'opaque-subject',
    });
    expect(identity.eq.mock.calls).toEqual([
      ['client_id', 'client'],
      ['lms_subject', 'opaque-subject'],
    ]);
  });
  it.each([null, { id: userId, org_id: userId, user_id: userId }])(
    'rejects an absent or foreign identity before granting access',
    async (identity) => {
      mocks.from
        .mockReturnValueOnce(lookup({ id: orgId, org_id: orgId, stage_id: 'stage' }))
        .mockReturnValueOnce(lookup(identity));
      await expect(resolveLaunchBindings(platform, launch)).rejects.toThrow('not registered');
      expect(mocks.from).toHaveBeenCalledTimes(2);
    },
  );
  it('refuses an inactive tenant', async () => {
    mocks.from
      .mockReturnValueOnce(lookup({ id: orgId, org_id: orgId, stage_id: 'stage' }))
      .mockReturnValueOnce(lookup({ id: userId, org_id: orgId, user_id: userId }))
      .mockReturnValueOnce(lookup(null))
      .mockReturnValueOnce(lookup({ user_id: userId }));
    await expect(resolveLaunchBindings(platform, launch)).rejects.toThrow('inactive');
  });
});

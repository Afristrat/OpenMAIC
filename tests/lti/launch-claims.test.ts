import { describe, expect, it } from 'vitest';
import { parseVerifiedLaunchClaims } from '@/lib/lti/launch-claims';
import { LTI_CLAIMS, type LTIPlatformConfig } from '@/lib/lti/types';

const platform: LTIPlatformConfig = {
  id: 'registration', clientId: 'client', deploymentId: 'deployment',
  issuer: 'https://lms.example.org', jwksUrl: 'https://lms.example.org/jwks',
  authUrl: 'https://lms.example.org/auth', tokenUrl: 'https://lms.example.org/token',
};
const payload = {
  sub: 'learner', nonce: 'nonce', aud: platform.clientId,
  [LTI_CLAIMS.MESSAGE_TYPE]: 'LtiResourceLinkRequest',
  [LTI_CLAIMS.VERSION]: '1.3.0',
  [LTI_CLAIMS.DEPLOYMENT_ID]: platform.deploymentId,
  [LTI_CLAIMS.TARGET_LINK_URI]: 'https://qalem.ma/api/lti/launch',
  [LTI_CLAIMS.RESOURCE_LINK]: { id: 'assignment' },
  [LTI_CLAIMS.ROLES]: [],
};

describe('verified LTI launch claims', () => {
  it('preserves the verified identity, nonce and declared AGS permissions', () => {
    const scope = ['https://purl.imsglobal.org/spec/lti-ags/scope/score'];
    expect(parseVerifiedLaunchClaims({ ...payload,
      [LTI_CLAIMS.AGS]: { lineitem: 'https://lms.example.org/items/1', scope },
    }, platform)).toMatchObject({ userId: 'learner', nonce: 'nonce',
      resourceLinkId: 'assignment', deploymentId: 'deployment', agsScopes: scope });
    expect(parseVerifiedLaunchClaims(payload, platform).agsScopes).toEqual([]);
  });

  it.each([
    { sub: '' }, { nonce: undefined },
    { [LTI_CLAIMS.DEPLOYMENT_ID]: 'other-deployment' },
    { [LTI_CLAIMS.ROLES]: 'Instructor' },
    { [LTI_CLAIMS.RESOURCE_LINK]: {} },
    { aud: 'other-client' }, { azp: 'other-client' },
    { aud: ['client', 'other-client'] },
    { [LTI_CLAIMS.VERSION]: '1.1.0' },
    { [LTI_CLAIMS.MESSAGE_TYPE]: 'LtiDeepLinkingRequest' },
  ])('rejects invalid or foreign launch claims: %j', (overrides) => {
    expect(() => parseVerifiedLaunchClaims({ ...payload, ...overrides }, platform)).toThrow();
  });

  it('requires the registered authorized party for multiple audiences', () => {
    expect(parseVerifiedLaunchClaims({ ...payload, aud: ['client', 'other'], azp: 'client' }, platform).userId).toBe('learner');
  });

  it.each(['http://lms.example.org/item', 'https://user:password@lms.example.org/item', 'https://lms.example.org/item#fragment', 'invalid'])('rejects unsafe endpoint format without echoing it: %s', (lineitem) => {
    expect(() => parseVerifiedLaunchClaims({ ...payload,
      [LTI_CLAIMS.AGS]: { lineitem, scope: [] },
    }, platform)).toThrow('Invalid LTI launch claims');
  });
});

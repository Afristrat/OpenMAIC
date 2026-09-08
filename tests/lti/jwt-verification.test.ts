import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { verifyLTIToken } from '@/lib/lti';
import { LTI_CLAIMS } from '@/lib/lti/types';
const network = vi.hoisted(() => vi.fn());
vi.mock('@/lib/lti/network', () => ({ requestLtiEndpoint: network }));
const platform = { id: 'registration', clientId: 'client', deploymentId: 'deployment', issuer: 'https://lms.example',
  jwksUrl: 'https://lms.example/jwks', authUrl: 'https://lms.example/auth', tokenUrl: 'https://lms.example/token' };
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: object;
const claims = { sub: 'learner', nonce: 'verified-nonce',
  [LTI_CLAIMS.MESSAGE_TYPE]: 'LtiResourceLinkRequest', [LTI_CLAIMS.VERSION]: '1.3.0',
  [LTI_CLAIMS.DEPLOYMENT_ID]: 'deployment', [LTI_CLAIMS.RESOURCE_LINK]: { id: 'assignment' },
  [LTI_CLAIMS.TARGET_LINK_URI]: 'https://qalem.ma/api/lti/launch', [LTI_CLAIMS.ROLES]: [] };
async function signed(overrides: JWTPayload = {}, privateKey = keys.privateKey) {
  return new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(typeof overrides.iss === 'string' ? overrides.iss : platform.issuer)
    .setAudience(overrides.aud ?? platform.clientId).setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m').sign(privateKey);
}
describe('LTI JWT verification with real RSA signatures', () => {
  beforeAll(async () => {
    keys = await generateKeyPair('RS256');
    jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'fixture', alg: 'RS256', use: 'sig' }] };
  });
  beforeEach(() => network.mockReset().mockImplementation(async () => Response.json(jwks)));
  it('verifies the signature before returning launch identity through the bounded transport', async () => {
    expect(await verifyLTIToken(await signed(), platform)).toMatchObject({ userId: 'learner', nonce: 'verified-nonce' });
    expect(network).toHaveBeenCalledWith(platform.jwksUrl, { method: 'GET' }, 262144);
  });
  it.each([{ iss: 'https://foreign.example' }, { aud: 'other' }, { exp: 1 }, { nonce: '' }])('rejects invalid signed claims %j', async (overrides) => {
    await expect(verifyLTIToken(await signed(overrides), platform)).rejects.toThrow();
  });
  it('rejects a signature made by another key even with the expected key ID', async () => {
    const foreign = await generateKeyPair('RS256');
    await expect(verifyLTIToken(await signed({}, foreign.privateKey), platform)).rejects.toThrow();
  });
  it('does not treat a failed key fetch as a valid launch', async () => {
    network.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(verifyLTIToken(await signed(), platform)).rejects.toThrow('public keys unavailable');
  });
});

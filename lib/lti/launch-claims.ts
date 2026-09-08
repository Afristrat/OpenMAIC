import { z } from 'zod';
import { LTI_CLAIMS, type LTILaunchContext, type LTIPlatformConfig } from './types';

const text = z.string().min(1).max(4096);
const endpoint = text.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
}, 'HTTPS endpoint required');

const claimsSchema = z.object({
  sub: text,
  nonce: text,
  azp: text.optional(),
  aud: z.union([text, z.array(text).min(1)]),
  email: z.email().optional(),
  name: text.optional(),
  given_name: text.optional(),
  family_name: text.optional(),
  [LTI_CLAIMS.MESSAGE_TYPE]: z.literal('LtiResourceLinkRequest'),
  [LTI_CLAIMS.VERSION]: z.literal('1.3.0'),
  [LTI_CLAIMS.DEPLOYMENT_ID]: text,
  [LTI_CLAIMS.TARGET_LINK_URI]: endpoint,
  [LTI_CLAIMS.RESOURCE_LINK]: z.object({ id: text, title: text.optional() }),
  [LTI_CLAIMS.ROLES]: z.array(text).max(100),
  [LTI_CLAIMS.CONTEXT]: z.object({ id: text, title: text.optional(), label: text.optional() }).optional(),
  [LTI_CLAIMS.LAUNCH_PRESENTATION]: z.object({ return_url: endpoint.optional() }).optional(),
  [LTI_CLAIMS.AGS]: z.object({
    lineitem: endpoint.optional(),
    lineitems: endpoint.optional(),
    scope: z.array(text).max(20),
  }).optional(),
});

/** Only call after JWT signature, issuer, audience and expiry verification. */
export function parseVerifiedLaunchClaims(
  payload: unknown,
  platform: LTIPlatformConfig,
): LTILaunchContext {
  const result = claimsSchema.safeParse(payload);
  // Do not expose claim values (identities or URLs) through validation errors.
  if (!result.success) throw new Error('Invalid LTI launch claims');
  const claims = result.data;
  if (claims[LTI_CLAIMS.DEPLOYMENT_ID] !== platform.deploymentId) {
    throw new Error('LTI deployment mismatch');
  }
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
  if (!audiences.includes(platform.clientId) ||
    (claims.azp !== undefined && claims.azp !== platform.clientId) ||
    (audiences.length > 1 && claims.azp !== platform.clientId)) {
    throw new Error('LTI authorized party mismatch');
  }
  const resource = claims[LTI_CLAIMS.RESOURCE_LINK];
  const context = claims[LTI_CLAIMS.CONTEXT];
  const ags = claims[LTI_CLAIMS.AGS];
  return {
    userId: claims.sub,
    nonce: claims.nonce,
    email: claims.email,
    name: claims.name,
    givenName: claims.given_name,
    familyName: claims.family_name,
    roles: claims[LTI_CLAIMS.ROLES],
    courseId: context?.id,
    courseName: context?.title ?? context?.label,
    resourceLinkId: resource.id,
    resourceLinkTitle: resource.title,
    returnUrl: claims[LTI_CLAIMS.LAUNCH_PRESENTATION]?.return_url,
    lineItemUrl: ags?.lineitem,
    agsScopes: ags?.scope ?? [],
    deploymentId: claims[LTI_CLAIMS.DEPLOYMENT_ID],
    targetLinkUri: claims[LTI_CLAIMS.TARGET_LINK_URI],
  };
}

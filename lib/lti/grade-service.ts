import * as jose from 'jose';
import { z } from 'zod';
import { LtiNetworkPolicyError, requestLtiEndpoint, type LtiRequest } from './network';
import type { LTIPlatformConfig, LTIGradePayload } from './types';
import { getKeyPair } from './index';

export const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
const contextSchema = z.object({
  qalemUserId: z.uuid(),
  resourceLinkId: z.string().min(1).max(4096),
  // Persisted score-change time, never the time of a delivery retry.
  timestamp: z.iso.datetime({ offset: true }),
  scopes: z.array(z.string()).refine((scopes) => scopes.includes(AGS_SCORE_SCOPE)),
});
export type GradeDeliveryContext = z.infer<typeof contextSchema>;
const gradeSchema = z.object({
  userId: z.string().min(1).max(4096),
  scoreGiven: z.number().min(0).max(100),
  scoreMaximum: z.literal(100),
  activityProgress: z.enum(['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed']),
  gradingProgress: z.enum(['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady']),
});
const tokenSchema = z.object({
  access_token: z.string().min(1).max(16384),
  token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
});

class AGSRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function request(endpoint: string, init: LtiRequest): Promise<Response> {
  try {
    return await requestLtiEndpoint(endpoint, init, 32768);
  } catch (error) {
    if (error instanceof LtiNetworkPolicyError)
      throw new AGSRequestError('AGS endpoint rejected', false);
    throw error;
  }
}

async function readToken(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AGSRequestError('Invalid AGS token response', false);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 32768) throw new AGSRequestError('Oversized AGS token response', false);
      chunks.push(chunk.value);
    }
    const parsed = tokenSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) throw new AGSRequestError('Invalid AGS token response', false);
    return parsed.data.access_token;
  } finally {
    await reader.cancel();
  }
}

function httpError(phase: string, status: number): AGSRequestError {
  return new AGSRequestError(
    `${phase} HTTP ${status}`,
    status === 408 || status === 429 || status >= 500,
  );
}

async function getAccessToken(platform: LTIPlatformConfig): Promise<string> {
  const { privateKey, kid } = await getKeyPair();
  const assertion = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(platform.clientId)
    .setSubject(platform.clientId)
    .setAudience(platform.tokenUrl)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);
  const response = await request(platform.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: AGS_SCORE_SCOPE,
    }).toString(),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw httpError('AGS token', response.status);
  }
  return readToken(response);
}

export interface GradeDeliveryResult {
  success: boolean;
  retryable: boolean;
  error: string | null;
}

/** One network attempt. The durable worker owns retry and atomic audit writes. */
export async function submitGrade(
  platform: LTIPlatformConfig,
  lineItemUrl: string,
  grade: LTIGradePayload,
  context: GradeDeliveryContext,
): Promise<GradeDeliveryResult> {
  const validatedGrade = gradeSchema.safeParse(grade);
  const validatedContext = contextSchema.safeParse(context);
  if (!validatedGrade.success || !validatedContext.success) throw new Error('Invalid AGS delivery');
  const scoreUrl = new URL(lineItemUrl);
  scoreUrl.pathname = `${scoreUrl.pathname.replace(/\/$/, '')}/scores`;
  const payload = JSON.stringify({
    ...validatedGrade.data,
    timestamp: validatedContext.data.timestamp,
  });
  try {
    const token = await getAccessToken(platform);
    const response = await request(scoreUrl.href, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: payload,
    });
    await response.body?.cancel();
    if (!response.ok) throw httpError('AGS score', response.status);
    return { success: true, retryable: false, error: null };
  } catch (error) {
    return {
      success: false,
      retryable: !(error instanceof AGSRequestError) || error.retryable,
      error: error instanceof AGSRequestError ? error.message : 'AGS transport failure',
    };
  }
}

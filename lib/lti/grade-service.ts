import * as jose from 'jose';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
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
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

async function request(endpoint: string, init: RequestInit): Promise<Response> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || await validateUrlForSSRF(endpoint)) {
    throw new AGSRequestError('AGS endpoint rejected', false);
  }
  // Never forward assertions or bearer tokens through a redirect.
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
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
  } finally { await reader.cancel(); }
}

function httpError(phase: string, status: number): AGSRequestError {
  return new AGSRequestError(`${phase} HTTP ${status}`, status === 408 || status === 429 || status >= 500);
}

async function getAccessToken(platform: LTIPlatformConfig): Promise<string> {
  const { privateKey, kid } = await getKeyPair();
  const assertion = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(platform.clientId).setSubject(platform.clientId).setAudience(platform.tokenUrl)
    .setIssuedAt().setExpirationTime('5m').setJti(crypto.randomUUID()).sign(privateKey);
  const response = await request(platform.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion, scope: AGS_SCORE_SCOPE }).toString(),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw httpError('AGS token', response.status);
  }
  return readToken(response);
}

/** Server-only delivery; caller must provide the persisted, authorized context.
 * Transient failures retry at 1s/2s. Audit failure is thrown outside the retry
 * block: it must never turn an accepted score into another network submission.
 */
export async function submitGrade(
  platform: LTIPlatformConfig,
  lineItemUrl: string,
  grade: LTIGradePayload,
  context: GradeDeliveryContext,
): Promise<boolean> {
  const validatedGrade = gradeSchema.safeParse(grade);
  const validatedContext = contextSchema.safeParse(context);
  if (!validatedGrade.success || !validatedContext.success) throw new Error('Invalid AGS delivery');
  const scoreUrl = new URL(lineItemUrl);
  scoreUrl.pathname = `${scoreUrl.pathname.replace(/\/$/, '')}/scores`;
  const payload = JSON.stringify({ ...validatedGrade.data, timestamp: validatedContext.data.timestamp });
  const service = createServiceSupabaseClient();
  for (let attempt = 1; attempt <= 3; attempt++) {
    let success = false;
    let retryable = false;
    let errorMessage: string | null = null;
    try {
      const token = await getAccessToken(platform);
      const response = await request(scoreUrl.href, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      }, body: payload });
      await response.body?.cancel();
      if (!response.ok) throw httpError('AGS score', response.status);
      success = true;
    } catch (error) {
      // Never persist raw provider bodies, URLs, credentials or exception text.
      retryable = !(error instanceof AGSRequestError) || error.retryable;
      errorMessage = error instanceof AGSRequestError ? error.message : 'AGS transport failure';
    }
    const audit = await service.from('lti_grade_submissions').insert({
      user_id: context.qalemUserId, client_id: platform.clientId,
      resource_link_id: context.resourceLinkId, line_item_url: lineItemUrl,
      score_given: grade.scoreGiven, score_maximum: grade.scoreMaximum,
      activity_progress: grade.activityProgress, grading_progress: grade.gradingProgress,
      success, error_message: errorMessage,
    });
    if (audit.error) throw new Error('AGS audit persistence failed');
    if (success) return true;
    if (!retryable) return false;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  }
  return false;
}

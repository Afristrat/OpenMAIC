// =============================================================================
// LTI 1.3 Assignment and Grade Services (AGS)
// Sends grades back to the LMS via the LTI AGS protocol.
// =============================================================================

import * as jose from 'jose';
import { createLogger } from '@/lib/logger';
import type { LTIPlatformConfig, LTIGradePayload } from './types';
import { getKeyPair } from './index';

const log = createLogger('LTI-AGS');

// ---------------------------------------------------------------------------
// OAuth2 client_credentials token for AGS
// ---------------------------------------------------------------------------

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Obtain an OAuth2 access token from the platform's token endpoint
 * using the client_credentials grant with a signed JWT assertion.
 */
async function getAccessToken(
  platform: LTIPlatformConfig,
): Promise<string> {
  const { privateKey, kid } = await getKeyPair();

  // Build the client assertion JWT (RFC 7523)
  const clientAssertion = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(platform.clientId)
    .setSubject(platform.clientId)
    .setAudience(platform.tokenUrl)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type:
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
    scope: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    ].join(' '),
  });

  const response = await fetch(platform.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token request failed (${response.status}): ${errorText}`,
    );
  }

  const tokenData = (await response.json()) as AccessTokenResponse;
  return tokenData.access_token;
}

// ---------------------------------------------------------------------------
// Grade submission
// ---------------------------------------------------------------------------

/**
 * Submit a grade to the LMS via the LTI AGS score endpoint.
 *
 * Retries up to 3 times with exponential backoff on transient failures.
 * Logs every submission attempt to `lti_grade_submissions` for audit.
 */
export async function submitGrade(
  platformConfig: LTIPlatformConfig,
  lineItemUrl: string,
  grade: LTIGradePayload,
): Promise<boolean> {
  const maxRetries = 3;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = await getAccessToken(platformConfig);

      // AGS score endpoint is lineItemUrl + "/scores"
      const scoreUrl = lineItemUrl.endsWith('/')
        ? `${lineItemUrl}scores`
        : `${lineItemUrl}/scores`;

      const scorePayload = {
        userId: grade.userId,
        scoreGiven: grade.scoreGiven,
        scoreMaximum: grade.scoreMaximum,
        activityProgress: grade.activityProgress,
        gradingProgress: grade.gradingProgress,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(scoreUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.ims.lis.v1.score+json',
          Accept: 'application/json',
        },
        body: JSON.stringify(scorePayload),
      });

      if (response.ok) {
        log.info(
          `Grade submitted successfully for user=${grade.userId} ` +
            `score=${grade.scoreGiven}/${grade.scoreMaximum}`,
        );

        await logGradeSubmission(
          platformConfig.clientId,
          grade,
          lineItemUrl,
          true,
        );

        return true;
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText}`;
        log.error(`Grade submission failed (non-retryable): ${lastError}`);
        break;
      }

      // Retryable error
      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.warn(
        `Grade submission attempt ${attempt}/${maxRetries} failed: ${lastError}`,
      );
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : 'Unknown error';
      log.warn(
        `Grade submission attempt ${attempt}/${maxRetries} error: ${lastError}`,
      );
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  log.error(
    `Grade submission failed after ${maxRetries} attempts for user=${grade.userId}: ${lastError}`,
  );

  await logGradeSubmission(
    platformConfig.clientId,
    grade,
    lineItemUrl,
    false,
    lastError,
  );

  return false;
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

/**
 * Log a grade submission attempt to Supabase for audit purposes.
 */
async function logGradeSubmission(
  clientId: string,
  grade: LTIGradePayload,
  lineItemUrl: string,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      log.warn('Cannot log grade submission: missing SUPABASE env vars');
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase.from('lti_grade_submissions').insert({
      user_id: grade.userId,
      client_id: clientId,
      resource_link_id: '', // Caller should provide, omitted here for simplicity
      line_item_url: lineItemUrl,
      score_given: grade.scoreGiven,
      score_maximum: grade.scoreMaximum,
      activity_progress: grade.activityProgress,
      grading_progress: grade.gradingProgress,
      success,
      error_message: errorMessage ?? null,
    });

    if (error) {
      log.warn('Failed to log grade submission:', error.message);
    }
  } catch (err) {
    log.warn(
      'Exception logging grade submission:',
      err instanceof Error ? err.message : 'unknown',
    );
  }
}

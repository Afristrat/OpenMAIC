/**
 * LTI 1.3 OIDC Login Initiation Endpoint
 *
 * GET/POST: Receives the OIDC login initiation from the LMS platform.
 * Validates the request, generates nonce + state, stores the nonce,
 * and redirects back to the platform's authorization URL.
 *
 * @see https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import {
  getPlatformConfig,
  getPlatformConfigByIssuer,
  storeNonce,
} from '@/lib/lti';

const log = createLogger('LTI-Login');

async function handleLoginInitiation(req: NextRequest): Promise<NextResponse> {
  try {
    // Extract params from either GET query or POST body
    let params: URLSearchParams;
    if (req.method === 'POST') {
      const body = await req.text();
      params = new URLSearchParams(body);
    } else {
      params = req.nextUrl.searchParams;
    }

    const iss = params.get('iss');
    const loginHint = params.get('login_hint');
    const targetLinkUri = params.get('target_link_uri');
    const clientId = params.get('client_id');
    const ltiMessageHint = params.get('lti_message_hint');
    const ltiDeploymentId = params.get('lti_deployment_id');

    // Validate target_link_uri against allowed app URL
    const appUrl = process.env.LTI_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (targetLinkUri && !targetLinkUri.startsWith(appUrl)) {
      return NextResponse.json({ error: 'Invalid target_link_uri' }, { status: 400 });
    }

    // Validate required parameters
    if (!iss || !loginHint || !targetLinkUri) {
      log.warn('Missing required OIDC login params');
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: iss, login_hint, target_link_uri',
        },
        { status: 400 },
      );
    }

    // Look up the platform config — by client_id first, then by issuer
    let platform = clientId
      ? await getPlatformConfig(clientId)
      : null;

    if (!platform) {
      platform = await getPlatformConfigByIssuer(iss);
    }

    if (!platform) {
      log.warn(`Unknown LTI platform: iss=${iss}, client_id=${clientId}`);
      return NextResponse.json(
        { success: false, error: 'Unknown LTI platform' },
        { status: 403 },
      );
    }

    // Generate nonce and state
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    // Store the nonce for later verification
    await storeNonce(nonce, platform.clientId);

    // Build the OIDC authentication request URL
    const authParams = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: platform.clientId,
      redirect_uri: `${process.env.LTI_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/lti/launch`,
      login_hint: loginHint,
      nonce,
      state,
    });

    if (ltiMessageHint) {
      authParams.set('lti_message_hint', ltiMessageHint);
    }

    if (ltiDeploymentId) {
      authParams.set('lti_deployment_id', ltiDeploymentId);
    }

    const redirectUrl = `${platform.authUrl}?${authParams.toString()}`;

    // Store state + platform client_id in a cookie so we can verify on launch
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('lti_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none', // Required for cross-origin LMS launches
      maxAge: 600, // 10 minutes
      path: '/',
    });
    response.cookies.set('lti_client_id', platform.clientId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 600,
      path: '/',
    });

    log.info(
      `OIDC login initiation: redirecting to ${platform.issuer} for client_id=${platform.clientId}`,
    );

    return response;
  } catch (error) {
    log.error('OIDC login initiation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleLoginInitiation(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleLoginInitiation(req);
}

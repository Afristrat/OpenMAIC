/**
 * LTI 1.3 Launch Endpoint
 *
 * POST: Receives the id_token from the platform after OIDC auth.
 * Verifies the JWT signature, validates nonce + state, extracts LTI claims,
 * resolves registered identities and opens the mapped classroom with SSO.
 *
 * @see https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getPlatformConfig, verifyLTIToken, consumeNonce } from '@/lib/lti';
import { resolveLaunchBindings } from '@/lib/lti/bindings';
import { establishLaunchSession } from '@/lib/lti/session';

const log = createLogger('LTI-Launch');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const idToken = params.get('id_token');
    const state = params.get('state');

    if (!idToken || !state) {
      log.warn('Missing id_token or state in launch request');
      return NextResponse.json(
        { success: false, error: 'Missing id_token or state' },
        { status: 400 },
      );
    }

    // Verify state matches the cookie
    const storedState = req.cookies.get('lti_state')?.value;
    const storedClientId = req.cookies.get('lti_client_id')?.value;

    if (!storedState || storedState !== state) {
      log.warn('LTI state mismatch — possible CSRF or expired session');
      return NextResponse.json(
        { success: false, error: 'Invalid state parameter' },
        { status: 403 },
      );
    }

    if (!storedClientId) {
      log.warn('Missing lti_client_id cookie');
      return NextResponse.json(
        { success: false, error: 'Missing platform context' },
        { status: 403 },
      );
    }

    // Look up the platform configuration
    const platform = await getPlatformConfig(storedClientId);
    if (!platform) {
      log.error(`Platform not found for client_id=${storedClientId}`);
      return NextResponse.json({ success: false, error: 'Unknown LTI platform' }, { status: 403 });
    }

    // Validate id_token format before decoding / verifying
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      log.warn('Malformed id_token: expected 3 parts, got ' + tokenParts.length);
      return NextResponse.json({ success: false, error: 'Malformed id_token' }, { status: 400 });
    }

    // Verify the JWT signature and extract claims
    let launchContext;
    try {
      launchContext = await verifyLTIToken(idToken, platform);
    } catch (err) {
      log.error('JWT verification failed', err instanceof Error ? err.name : 'UnknownError');
      return NextResponse.json(
        { success: false, error: 'Token verification failed' },
        { status: 401 },
      );
    }

    // Consume only the nonce returned by signature and claim verification.
    const nonceValid = await consumeNonce(launchContext.nonce, storedClientId);
    if (!nonceValid) {
      log.warn('Invalid or already consumed nonce');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired nonce' },
        { status: 401 },
      );
    }

    const binding = await resolveLaunchBindings(platform, launchContext);
    const app = new URL(process.env.LTI_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '');
    if (app.protocol !== 'https:' || app.username || app.password) {
      throw new Error('Invalid LTI application origin');
    }
    const response = NextResponse.redirect(
      new URL(`/classroom/${encodeURIComponent(binding.stageId)}`, app),
      303,
    );
    await establishLaunchSession(req, response, binding, launchContext);
    response.cookies.delete('lti_state');
    response.cookies.delete('lti_client_id');
    return response;
  } catch (error) {
    log.error('LTI launch failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

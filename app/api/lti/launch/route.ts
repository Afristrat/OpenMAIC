/**
 * LTI 1.3 Launch Endpoint
 *
 * POST: Receives the id_token from the platform after OIDC auth.
 * Verifies the JWT signature, validates nonce + state, extracts LTI claims,
 * provisions or updates the user in Supabase, and redirects to the classroom.
 *
 * @see https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { getPlatformConfig, verifyLTIToken, consumeNonce } from '@/lib/lti';
import { LTI_ROLE_MAPPINGS } from '@/lib/lti/types';

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
      return NextResponse.json(
        { success: false, error: 'Unknown LTI platform' },
        { status: 403 },
      );
    }

    // Validate id_token format before decoding / verifying
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      log.warn('Malformed id_token: expected 3 parts, got ' + tokenParts.length);
      return NextResponse.json(
        { success: false, error: 'Malformed id_token' },
        { status: 400 },
      );
    }

    // Verify the JWT signature and extract claims
    let launchContext;
    try {
      launchContext = await verifyLTIToken(idToken, platform);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown verification error';
      log.error(`JWT verification failed: ${message}`);
      return NextResponse.json(
        { success: false, error: `Token verification failed: ${message}` },
        { status: 401 },
      );
    }

    // Decode JWT to get the nonce claim for verification
    const [, payloadB64] = tokenParts;
    const tokenPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as { nonce?: string };

    if (!tokenPayload.nonce) {
      log.warn('Missing nonce in id_token');
      return NextResponse.json(
        { success: false, error: 'Missing nonce in token' },
        { status: 401 },
      );
    }

    // Verify and consume the nonce
    const nonceValid = await consumeNonce(tokenPayload.nonce, storedClientId);
    if (!nonceValid) {
      log.warn('Invalid or already consumed nonce');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired nonce' },
        { status: 401 },
      );
    }

    // Provision or update user in Supabase
    const userId = await provisionUser(launchContext);

    // Build redirect URL to the classroom
    const appUrl =
      process.env.LTI_APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const redirectParams = new URLSearchParams({
      lti: 'true',
      resourceLink: launchContext.resourceLinkId,
    });

    if (launchContext.courseId) {
      redirectParams.set('courseId', launchContext.courseId);
    }
    if (launchContext.lineItemUrl) {
      redirectParams.set('lineItem', launchContext.lineItemUrl);
    }

    const redirectUrl = `${appUrl}/classroom?${redirectParams.toString()}`;

    log.info(
      `LTI launch successful: user=${launchContext.userId}, ` +
        `resourceLink=${launchContext.resourceLinkId}, ` +
        `roles=${launchContext.roles.length}`,
    );

    // Clear the LTI cookies and redirect
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete('lti_state');
    response.cookies.delete('lti_client_id');

    // Set a session cookie with LTI context for the classroom to read
    response.cookies.set(
      'lti_context',
      JSON.stringify({
        userId,
        ltiUserId: launchContext.userId,
        resourceLinkId: launchContext.resourceLinkId,
        courseId: launchContext.courseId,
        lineItemUrl: launchContext.lineItemUrl,
        returnUrl: launchContext.returnUrl,
        clientId: storedClientId,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/',
      },
    );

    return response;
  } catch (error) {
    log.error('LTI launch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// User provisioning
// ---------------------------------------------------------------------------

/**
 * Create or update a user profile in Supabase based on LTI launch claims.
 * Returns the Supabase user ID (profile id).
 */
async function provisionUser(launchContext: {
  userId: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  roles: string[];
}): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE env vars');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Determine Qalem role from LTI roles
  const isInstructor = launchContext.roles.some(
    (r) =>
      r === LTI_ROLE_MAPPINGS.INSTRUCTOR ||
      r.includes('Instructor') ||
      r.includes('TeachingAssistant'),
  );

  // Build display name for upsert
  const displayName =
    launchContext.name ??
    ([launchContext.givenName, launchContext.familyName]
      .filter(Boolean)
      .join(' ') || `LTI User ${launchContext.userId.slice(0, 8)}`);

  const email =
    launchContext.email ?? `lti-${launchContext.userId}@qalem.local`;

  // Try to create the user directly — if a duplicate exists, handle the error
  const { data: newUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        lti_user_id: launchContext.userId,
        full_name: displayName,
        is_instructor: isInstructor,
      },
    });

  if (createError) {
    // User already exists — look up by email via profiles table
    if (
      createError.message?.includes('already been registered') ||
      createError.message?.includes('already exists') ||
      createError.status === 422
    ) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .limit(1)
        .single();

      if (existingProfile) {
        // Update profile with latest LTI info
        if (displayName) {
          await supabase
            .from('profiles')
            .update({ nickname: displayName })
            .eq('id', existingProfile.id);
        }
        return existingProfile.id;
      }

      // Fallback: paginated search through auth.users
      let page = 1;
      const perPage = 50;
      while (true) {
        const { data: usersPage } = await supabase.auth.admin.listUsers({
          page,
          perPage,
        });
        const match = usersPage?.users?.find((u) => u.email === email);
        if (match) {
          if (displayName) {
            await supabase
              .from('profiles')
              .update({ nickname: displayName })
              .eq('id', match.id);
          }
          return match.id;
        }
        if (!usersPage?.users || usersPage.users.length < perPage) break;
        page++;
      }

      log.error('User exists but could not be found:', email);
      throw new Error('User provisioning failed: duplicate user not found');
    }

    log.error('Failed to create LTI user:', createError.message);
    throw new Error(`User provisioning failed: ${createError.message}`);
  }

  if (!newUser.user) {
    throw new Error('User provisioning failed: no user returned');
  }

  // The profiles table trigger should auto-create the profile row,
  // but update it with the display name just in case
  await supabase
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      nickname: displayName,
    });

  log.info(
    `Provisioned LTI user: ${newUser.user.id} (${displayName}, instructor=${isInstructor})`,
  );

  return newUser.user.id;
}

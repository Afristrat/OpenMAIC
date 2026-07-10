/**
 * LTI 1.3 JWKS Endpoint
 *
 * GET: Returns Qalem's public key in JWKS format.
 * Platforms use this to verify JWTs signed by Qalem (e.g., client assertions
 * for AGS grade passback).
 *
 * @see https://www.imsglobal.org/spec/security/v1p0/#platform-originating-messages
 */

import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getPublicJWK } from '@/lib/lti';

const log = createLogger('LTI-JWKS');

export async function GET(): Promise<NextResponse> {
  try {
    const jwk = await getPublicJWK();

    return NextResponse.json(
      { keys: [jwk] },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    log.error('Failed to generate JWKS:', error);
    return NextResponse.json(
      { error: 'Failed to generate JWKS' },
      { status: 500 },
    );
  }
}

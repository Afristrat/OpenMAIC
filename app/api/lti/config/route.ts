/**
 * LTI 1.3 Tool Configuration Endpoint
 *
 * GET: Returns the JSON configuration that LMS administrators need
 * to register Qalem as an LTI 1.3 tool provider.
 *
 * This follows the IMS LTI Tool Configuration format.
 */

import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const appUrl =
    process.env.LTI_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';

  const config = {
    title: 'Qalem',
    description:
      'AI-powered interactive classroom — transforms any topic or document into an immersive learning experience with AI teachers and classmates.',
    oidc_initiation_url: `${appUrl}/api/lti/login`,
    target_link_uri: `${appUrl}/api/lti/launch`,
    public_jwk_url: `${appUrl}/api/lti/jwks`,
    scopes: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    ],
    extensions: [
      {
        platform: 'canvas.instructure.com',
        settings: {
          placements: [
            {
              placement: 'assignment_selection',
              message_type: 'LtiResourceLinkRequest',
              target_link_uri: `${appUrl}/api/lti/launch`,
            },
            {
              placement: 'course_navigation',
              message_type: 'LtiResourceLinkRequest',
              target_link_uri: `${appUrl}/api/lti/launch`,
            },
          ],
        },
      },
    ],
    custom_fields: {
      course_id: '$Canvas.course.id',
      user_id: '$Canvas.user.id',
    },
    // LTI Advantage services
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      scope: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      ],
    },
  };

  return NextResponse.json(config, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      'Content-Type': 'application/json',
    },
  });
}

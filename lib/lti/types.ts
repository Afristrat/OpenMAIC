// =============================================================================
// LTI 1.3 — Type Definitions
// =============================================================================

/**
 * Configuration for a registered LTI platform (LMS).
 * Stored in `lti_registrations` table.
 */
export interface LTIPlatformConfig {
  id: string;
  clientId: string;
  issuer: string; // e.g. "https://moodle.example.com"
  jwksUrl: string;
  authUrl: string;
  tokenUrl: string;
  deploymentId: string;
}

/**
 * Parsed claims from a verified LTI 1.3 launch id_token.
 */
export interface LTILaunchContext {
  userId: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  roles: string[]; // LTI role URIs
  courseId?: string;
  courseName?: string;
  resourceLinkId: string;
  resourceLinkTitle?: string;
  returnUrl?: string;
  lineItemUrl?: string; // AGS lineitem for grade passback
  deploymentId: string;
  targetLinkUri?: string;
}

/**
 * Grade payload for LTI Assignment and Grade Services (AGS).
 */
export interface LTIGradePayload {
  userId: string;
  scoreGiven: number; // 0-100
  scoreMaximum: number; // typically 100
  activityProgress:
    | 'Initialized'
    | 'Started'
    | 'InProgress'
    | 'Submitted'
    | 'Completed';
  gradingProgress:
    | 'FullyGraded'
    | 'Pending'
    | 'PendingManual'
    | 'Failed'
    | 'NotReady';
}

/**
 * LTI 1.3 standard claim namespaces.
 */
export const LTI_CLAIMS = {
  MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  VERSION: 'https://purl.imsglobal.org/spec/lti/claim/version',
  DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  RESOURCE_LINK: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
  LAUNCH_PRESENTATION:
    'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  AGS: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
} as const;

/**
 * LTI 1.3 role URIs mapped to simplified Qalem roles.
 */
export const LTI_ROLE_MAPPINGS = {
  INSTRUCTOR:
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  LEARNER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  ADMIN:
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
  CONTENT_DEVELOPER:
    'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
} as const;

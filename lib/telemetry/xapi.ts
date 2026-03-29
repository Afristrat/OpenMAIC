// =============================================================================
// Qalem — Lightweight xAPI Client (zero external dependencies)
// =============================================================================

import type { XAPIConfig } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XAPIStatement {
  actor: { mbox: string; name?: string; objectType: 'Agent' };
  verb: { id: string; display: Record<string, string> };
  object: {
    id: string;
    definition?: { name?: Record<string, string>; type?: string };
  };
  result?: {
    score?: { scaled: number; raw: number; max: number };
    success?: boolean;
    completion?: boolean;
    duration?: string;
  };
  context?: {
    contextActivities?: { parent?: Array<{ id: string }> };
    extensions?: Record<string, unknown>;
  };
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Pre-defined ADL verbs
// ---------------------------------------------------------------------------

export const VERBS = {
  attempted: {
    id: 'http://adlnet.gov/expapi/verbs/attempted',
    display: { 'en-US': 'attempted' },
  },
  passed: {
    id: 'http://adlnet.gov/expapi/verbs/passed',
    display: { 'en-US': 'passed' },
  },
  failed: {
    id: 'http://adlnet.gov/expapi/verbs/failed',
    display: { 'en-US': 'failed' },
  },
  completed: {
    id: 'http://adlnet.gov/expapi/verbs/completed',
    display: { 'en-US': 'completed' },
  },
  experienced: {
    id: 'http://adlnet.gov/expapi/verbs/experienced',
    display: { 'en-US': 'experienced' },
  },
} as const;

// ---------------------------------------------------------------------------
// Activity type URIs
// ---------------------------------------------------------------------------

const ACTIVITY_TYPES = {
  assessment: 'http://adlnet.gov/expapi/activities/assessment',
  lesson: 'http://adlnet.gov/expapi/activities/lesson',
  interaction: 'http://adlnet.gov/expapi/activities/interaction',
  course: 'http://adlnet.gov/expapi/activities/course',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert seconds to ISO 8601 duration (e.g. PT120S) */
function secondsToISO8601(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  let iso = 'PT';
  if (h > 0) iso += `${h}H`;
  if (m > 0) iso += `${m}M`;
  if (s > 0 || iso === 'PT') iso += `${s}S`;
  return iso;
}

/** Build a mailto mbox from a user ID (opaque, not a real email) */
function userMbox(userId: string): string {
  return `mailto:${userId}@qalem.local`;
}

/** Build an activity IRI for a Qalem resource */
function activityId(stageId: string, sceneId?: string): string {
  const base = `https://qalem.app/stages/${stageId}`;
  return sceneId ? `${base}/scenes/${sceneId}` : base;
}

// ---------------------------------------------------------------------------
// Send statement to LRS
// ---------------------------------------------------------------------------

/**
 * POST a single xAPI statement to the configured LRS.
 * Returns true on success (2xx), false otherwise.
 * Never throws — failures are swallowed so telemetry cannot break the app.
 */
export async function sendStatement(
  statement: XAPIStatement,
  config: XAPIConfig,
): Promise<boolean> {
  if (!config.enabled) return false;

  try {
    const response = await fetch(`${config.endpoint}/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Experience-API-Version': '1.0.3',
        Authorization: config.auth,
      },
      body: JSON.stringify(statement),
    });
    return response.ok;
  } catch {
    // Telemetry must never crash the application
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

/**
 * Build an xAPI statement for a quiz attempt.
 * Automatically selects "passed" or "failed" verb based on score >= 0.7.
 */
export function trackQuizAttempted(
  userId: string,
  stageId: string,
  sceneId: string,
  score: number,
): XAPIStatement {
  const scaled = Math.max(0, Math.min(1, score));
  const verb = scaled >= 0.7 ? VERBS.passed : VERBS.failed;

  return {
    actor: { mbox: userMbox(userId), objectType: 'Agent' },
    verb,
    object: {
      id: activityId(stageId, sceneId),
      definition: {
        name: { 'en-US': `Quiz – Scene ${sceneId}` },
        type: ACTIVITY_TYPES.assessment,
      },
    },
    result: {
      score: { scaled, raw: scaled * 100, max: 100 },
      success: scaled >= 0.7,
      completion: true,
    },
    context: {
      contextActivities: {
        parent: [{ id: activityId(stageId) }],
      },
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an xAPI statement for viewing a slide.
 * @param duration Time spent on the slide in seconds
 */
export function trackSlideViewed(
  userId: string,
  stageId: string,
  sceneId: string,
  duration: number,
): XAPIStatement {
  return {
    actor: { mbox: userMbox(userId), objectType: 'Agent' },
    verb: VERBS.experienced,
    object: {
      id: activityId(stageId, sceneId),
      definition: {
        name: { 'en-US': `Slide – Scene ${sceneId}` },
        type: ACTIVITY_TYPES.lesson,
      },
    },
    result: {
      duration: secondsToISO8601(duration),
    },
    context: {
      contextActivities: {
        parent: [{ id: activityId(stageId) }],
      },
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an xAPI statement for completing a PBL scene.
 */
export function trackPBLCompleted(
  userId: string,
  stageId: string,
  sceneId: string,
): XAPIStatement {
  return {
    actor: { mbox: userMbox(userId), objectType: 'Agent' },
    verb: VERBS.completed,
    object: {
      id: activityId(stageId, sceneId),
      definition: {
        name: { 'en-US': `PBL – Scene ${sceneId}` },
        type: ACTIVITY_TYPES.interaction,
      },
    },
    result: { completion: true },
    context: {
      contextActivities: {
        parent: [{ id: activityId(stageId) }],
      },
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an xAPI statement for participating in a multi-agent discussion.
 * @param messageCount Number of messages the user sent
 */
export function trackDiscussionParticipated(
  userId: string,
  stageId: string,
  messageCount: number,
): XAPIStatement {
  return {
    actor: { mbox: userMbox(userId), objectType: 'Agent' },
    verb: VERBS.attempted,
    object: {
      id: activityId(stageId),
      definition: {
        name: { 'en-US': `Discussion – Stage ${stageId}` },
        type: ACTIVITY_TYPES.interaction,
      },
    },
    context: {
      extensions: {
        'https://qalem.app/extensions/messageCount': messageCount,
      },
    },
    timestamp: new Date().toISOString(),
  };
}

import { describe, expect, it } from 'vitest';
import {
  buildAnchorXapiStatement,
  type AnchorXapiEvent,
} from '@/lib/anchoring/xapi-outbox';

const ACTOR_ID = 'a'.repeat(64);
const SESSION_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = 'user@example.com';

const events: Array<{ event: AnchorXapiEvent; verb: string; activityType: string }> = [
  {
    event: { type: 'session_completed', sessionId: SESSION_ID, userId: USER_ID },
    verb: 'http://adlnet.gov/expapi/verbs/completed',
    activityType: 'http://adlnet.gov/expapi/activities/course',
  },
  {
    event: {
      type: 'quiz_answered',
      sessionId: SESSION_ID,
      userId: USER_ID,
      sceneId: 'quiz-1',
      score: 80,
    },
    verb: 'http://adlnet.gov/expapi/verbs/answered',
    activityType: 'http://adlnet.gov/expapi/activities/assessment',
  },
  {
    event: {
      type: 'evaluation_completed',
      sessionId: SESSION_ID,
      userId: USER_ID,
      phase: 'hot',
      score: 90,
    },
    verb: 'http://adlnet.gov/expapi/verbs/completed',
    activityType: 'http://adlnet.gov/expapi/activities/assessment',
  },
  {
    event: {
      type: 'evaluation_completed',
      sessionId: SESSION_ID,
      userId: USER_ID,
      phase: 'cold_30',
      score: 70,
    },
    verb: 'http://adlnet.gov/expapi/verbs/completed',
    activityType: 'http://adlnet.gov/expapi/activities/assessment',
  },
  {
    event: {
      type: 'seed_opened',
      sessionId: SESSION_ID,
      userId: USER_ID,
      deliveryId: '00000000-0000-4000-8000-000000000011',
    },
    verb: 'http://adlnet.gov/expapi/verbs/experienced',
    activityType: 'http://adlnet.gov/expapi/activities/lesson',
  },
];

describe('anchoring xAPI statements', () => {
  it.each(events)('builds a bounded $event.type statement', ({ event, verb, activityType }) => {
    const statement = buildAnchorXapiStatement(event, ACTOR_ID);

    expect(statement.actor).toEqual({
      mbox: `mailto:${ACTOR_ID}@qalem.invalid`,
      objectType: 'Agent',
    });
    expect(statement.actor).not.toHaveProperty('name');
    expect(statement.verb.id).toBe(verb);
    expect(statement.object.id).toMatch(/^https:\/\/qalem\.app\//);
    expect(statement.object.definition?.type).toBe(activityType);
    expect(Number.isNaN(Date.parse(statement.timestamp))).toBe(false);
    expect(JSON.stringify(statement)).not.toContain(USER_ID);
  });

  it('normalizes a quiz score into the xAPI score contract', () => {
    const statement = buildAnchorXapiStatement(
      {
        type: 'quiz_answered',
        sessionId: SESSION_ID,
        userId: USER_ID,
        sceneId: 'quiz-1',
        score: 80,
      },
      ACTOR_ID,
    );

    expect(statement.result).toEqual({
      score: { scaled: 0.8, raw: 80, max: 100 },
      success: true,
      completion: true,
    });
  });
});

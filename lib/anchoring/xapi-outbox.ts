import { createHmac } from 'node:crypto';
import { isFeatureEnabled } from '@/lib/flags';
import { enqueueXapiDelivery } from '@/lib/jobs/queue';
import { readOrganizationLrsConfig } from '@/lib/server/org-lrs-config';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { VERBS, type XAPIStatement } from '@/lib/telemetry/xapi';

export type AnchorXapiEvent =
  | { type: 'session_completed'; sessionId: string; userId: string }
  | {
      type: 'quiz_answered';
      sessionId: string;
      userId: string;
      sceneId: string;
      score: number;
    }
  | {
      type: 'evaluation_completed';
      sessionId: string;
      userId: string;
      phase: 'hot' | 'cold_30' | 'cold_60';
      score: number;
    }
  | { type: 'seed_opened'; sessionId: string; userId: string; deliveryId: string };

function pseudonym(userId: string, orgId: string): string {
  const key = process.env.XAPI_PSEUDONYM_KEY?.trim();
  if (!key || key.length < 32) throw new Error('XAPI_PSEUDONYM_KEY is missing or too short');
  return createHmac('sha256', key).update(`${orgId}:${userId}`).digest('hex');
}

function eventDedupeKey(event: AnchorXapiEvent): string {
  switch (event.type) {
    case 'session_completed':
      return `anchor-session:${event.sessionId}`;
    case 'quiz_answered':
      return `anchor-quiz:${event.sessionId}:${event.sceneId}`;
    case 'evaluation_completed':
      return `anchor-evaluation:${event.sessionId}:${event.phase}`;
    case 'seed_opened':
      return `anchor-seed-open:${event.deliveryId}`;
  }
}

export function buildAnchorXapiStatement(event: AnchorXapiEvent, actorId: string): XAPIStatement {
  const actor = { mbox: `mailto:${actorId}@qalem.invalid`, objectType: 'Agent' as const };
  const timestamp = new Date().toISOString();
  switch (event.type) {
    case 'session_completed':
      return {
        actor,
        verb: VERBS.completed,
        object: {
          id: `https://qalem.app/live-sessions/${event.sessionId}`,
          definition: {
            name: { 'fr-FR': 'Session de formation vécue' },
            type: 'http://adlnet.gov/expapi/activities/course',
          },
        },
        result: { completion: true },
        timestamp,
      };
    case 'quiz_answered': {
      const score = Math.max(0, Math.min(100, event.score));
      return {
        actor,
        verb: VERBS.answered,
        object: {
          id: `https://qalem.app/live-sessions/${event.sessionId}/quiz/${encodeURIComponent(event.sceneId)}`,
          definition: {
            name: { 'fr-FR': 'Quiz de la session' },
            type: 'http://adlnet.gov/expapi/activities/assessment',
          },
        },
        result: {
          score: { scaled: score / 100, raw: score, max: 100 },
          success: score >= 70,
          completion: true,
        },
        timestamp,
      };
    }
    case 'evaluation_completed':
      return {
        actor,
        verb: VERBS.completed,
        object: {
          id: `https://qalem.app/anchoring/${event.phase}`,
          definition: {
            name: { 'fr-FR': `Évaluation d’ancrage ${event.phase}` },
            type: 'http://adlnet.gov/expapi/activities/assessment',
          },
        },
        result: {
          score: { scaled: event.score / 100, raw: event.score, max: 100 },
          completion: true,
        },
        context: {
          extensions: { 'https://qalem.app/extensions/phase': event.phase },
        },
        timestamp,
      };
    case 'seed_opened':
      return {
        actor,
        verb: VERBS.experienced,
        object: {
          id: `https://qalem.app/anchor-deliveries/${event.deliveryId}`,
          definition: {
            name: { 'fr-FR': 'Graine d’ancrage ouverte' },
            type: 'http://adlnet.gov/expapi/activities/lesson',
          },
        },
        result: { completion: true },
        timestamp,
      };
  }
}

export async function enqueueAnchorXapiStatement(event: AnchorXapiEvent): Promise<boolean> {
  if (!(await isFeatureEnabled('xapi_emission'))) return false;
  const service = createServiceSupabaseClient();
  const { data: session, error } = await service
    .from('live_sessions')
    .select('id, courses(org_id)')
    .eq('id', event.sessionId)
    .eq('user_id', event.userId)
    .single();
  if (error || !session) throw new Error('xAPI session scope could not be resolved');
  const courseValue = session.courses;
  const course = Array.isArray(courseValue) ? courseValue[0] : courseValue;
  if (!course?.org_id) throw new Error('xAPI organization scope is missing');
  const config = await readOrganizationLrsConfig(course.org_id);
  if (!config?.enabled) return false;

  const statement = buildAnchorXapiStatement(event, pseudonym(event.userId, course.org_id));
  const { data: outbox, error: insertError } = await service
    .rpc('enqueue_consented_anchor_xapi', {
      p_actor: event.userId,
      p_session: event.sessionId,
      p_org: course.org_id,
      p_key: eventDedupeKey(event),
      p_statement: statement,
      p_target: config.endpoint,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (insertError) throw new Error('xAPI outbox insert failed');
  if (outbox === null) return false;
  if (!Number.isSafeInteger(outbox) || outbox < 0) throw new Error('Invalid xAPI outbox identity');
  // A duplicate preserves the original payload, timestamp, destination and status.
  // The existing recovery scan owns pending delivery if the first enqueue failed.
  if (outbox === 0) return true;
  try {
    await enqueueXapiDelivery({ outboxId: outbox });
  } catch {
    // The durable row remains queued and is recoverable independently of the user request.
  }
  return true;
}

export function enqueueAnchorEvaluationStatement(input: {
  sessionId: string;
  userId: string;
  phase: 'hot' | 'cold_30' | 'cold_60';
  score: number;
}): Promise<boolean> {
  return enqueueAnchorXapiStatement({ type: 'evaluation_completed', ...input });
}

export function enqueueAnchorSessionStatement(input: {
  sessionId: string;
  userId: string;
}): Promise<boolean> {
  return enqueueAnchorXapiStatement({ type: 'session_completed', ...input });
}

export function enqueueAnchorQuizStatement(input: {
  sessionId: string;
  userId: string;
  sceneId: string;
  score: number;
}): Promise<boolean> {
  return enqueueAnchorXapiStatement({ type: 'quiz_answered', ...input });
}

export function enqueueAnchorSeedOpenedStatement(input: {
  sessionId: string;
  userId: string;
  deliveryId: string;
}): Promise<boolean> {
  return enqueueAnchorXapiStatement({ type: 'seed_opened', ...input });
}

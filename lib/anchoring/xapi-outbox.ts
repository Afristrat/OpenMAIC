import { createHmac } from 'node:crypto';
import { isFeatureEnabled } from '@/lib/flags';
import { enqueueXapiDelivery } from '@/lib/jobs/queue';
import { readOrganizationLrsConfig } from '@/lib/server/org-lrs-config';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { VERBS, type XAPIStatement } from '@/lib/telemetry/xapi';

function pseudonym(userId: string, orgId: string): string {
  const key = process.env.XAPI_PSEUDONYM_KEY?.trim();
  if (!key || key.length < 32) throw new Error('XAPI_PSEUDONYM_KEY is missing or too short');
  return createHmac('sha256', key).update(`${orgId}:${userId}`).digest('hex');
}

export async function enqueueAnchorEvaluationStatement(input: {
  sessionId: string;
  userId: string;
  phase: 'cold_30' | 'cold_60';
  score: number;
}): Promise<boolean> {
  if (!(await isFeatureEnabled('xapi_emission'))) return false;
  const service = createServiceSupabaseClient();
  const { data: session, error } = await service
    .from('live_sessions')
    .select('id, courses(org_id)')
    .eq('id', input.sessionId)
    .eq('user_id', input.userId)
    .single();
  if (error || !session) throw new Error('xAPI session scope could not be resolved');
  const courseValue = session.courses;
  const course = Array.isArray(courseValue) ? courseValue[0] : courseValue;
  if (!course?.org_id) throw new Error('xAPI organization scope is missing');
  const config = await readOrganizationLrsConfig(course.org_id);
  if (!config?.enabled) return false;

  const statement: XAPIStatement = {
    actor: {
      mbox: `mailto:${pseudonym(input.userId, course.org_id)}@qalem.invalid`,
      objectType: 'Agent',
    },
    verb: VERBS.completed,
    object: {
      id: `https://qalem.app/anchoring/${input.phase}`,
      definition: {
        name: { 'fr-FR': `Évaluation d’ancrage ${input.phase}` },
        type: 'http://adlnet.gov/expapi/activities/assessment',
      },
    },
    result: {
      score: { scaled: input.score / 100, raw: input.score, max: 100 },
      completion: true,
    },
    context: {
      extensions: {
        'https://qalem.app/extensions/phase': input.phase,
      },
    },
    timestamp: new Date().toISOString(),
  };
  const { data: outbox, error: insertError } = await service
    .from('xapi_outbox')
    .upsert(
      {
        org_id: course.org_id,
        dedupe_key: `anchor-evaluation:${input.sessionId}:${input.phase}`,
        statement,
        lrs_target: config.endpoint,
      },
      { onConflict: 'org_id,dedupe_key' },
    )
    .select('id')
    .single();
  if (insertError || !outbox) throw new Error(`xAPI outbox insert failed: ${insertError?.message}`);
  try {
    await enqueueXapiDelivery({ outboxId: outbox.id });
  } catch {
    // The durable row remains queued and is recoverable independently of the user request.
  }
  return true;
}

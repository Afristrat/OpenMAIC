import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { AGS_SCORE_SCOPE } from './grade-service';

export class LtiAccessDenied extends Error {
  constructor() {
    super('LTI launch access is unavailable');
  }
}

const inputSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  stageId: z.string().min(1).max(4096),
});
const sessionSchema = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  client_id: z.string().min(1),
  resource_binding_id: z.uuid(),
  user_binding_id: z.uuid(),
  expires_at: z.iso.datetime({ offset: true }),
  line_item_url: z.string().nullable(),
  ags_scopes: z.array(z.string()),
});

/** userId must come from verified Auth, never request JSON or the LTI cookie. */
export async function resolveLtiContext(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new LtiAccessDenied();
  const { token, userId, stageId } = parsed.data;
  const service = createServiceSupabaseClient();
  const lookup = await service
    .from('lti_launch_sessions')
    .select(
      'id, org_id, client_id, resource_binding_id, user_binding_id, expires_at, line_item_url, ags_scopes',
    )
    .eq('token_hash', createHash('sha256').update(token).digest('hex'))
    .maybeSingle();
  if (lookup.error) throw new Error('LTI session lookup unavailable');
  const session = sessionSchema.safeParse(lookup.data);
  if (!session.success || Date.parse(session.data.expires_at) <= Date.now())
    throw new LtiAccessDenied();
  const data = session.data;
  const checks = await Promise.all([
    service
      .from('lti_resource_bindings')
      .select('id')
      .eq('id', data.resource_binding_id)
      .eq('client_id', data.client_id)
      .eq('org_id', data.org_id)
      .eq('stage_id', stageId)
      .maybeSingle(),
    service
      .from('lti_user_bindings')
      .select('id')
      .eq('id', data.user_binding_id)
      .eq('client_id', data.client_id)
      .eq('org_id', data.org_id)
      .eq('user_id', userId)
      .maybeSingle(),
    service
      .from('organizations')
      .select('id')
      .eq('id', data.org_id)
      .eq('status', 'active')
      .maybeSingle(),
    service
      .from('org_members')
      .select('user_id')
      .eq('org_id', data.org_id)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (checks.some((check) => check.error)) throw new Error('LTI access lookup unavailable');
  if (checks.some((check) => !check.data)) throw new LtiAccessDenied();
  return {
    sessionId: data.id,
    orgId: data.org_id,
    stageId,
    userId,
    resourceBindingId: data.resource_binding_id,
    userBindingId: data.user_binding_id,
    gradingEnabled: Boolean(data.line_item_url) && data.ags_scopes.includes(AGS_SCORE_SCOPE),
  };
}

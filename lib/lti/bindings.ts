import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { LTILaunchContext, LTIPlatformConfig } from './types';

const resourceSchema = z.object({ id: z.uuid(), org_id: z.uuid(), stage_id: z.string().min(1) });
const identitySchema = z.object({ id: z.uuid(), org_id: z.uuid(), user_id: z.uuid() });

/** Server-only: claims must already have passed signature, state and nonce checks. */
export async function resolveLaunchBindings(platform: LTIPlatformConfig, launch: LTILaunchContext) {
  const service = createServiceSupabaseClient();
  const [resourceResult, identityResult] = await Promise.all([
    service.from('lti_resource_bindings').select('id, org_id, stage_id')
      .eq('client_id', platform.clientId).eq('resource_link_id', launch.resourceLinkId).maybeSingle(),
    service.from('lti_user_bindings').select('id, org_id, user_id')
      .eq('client_id', platform.clientId).eq('lms_subject', launch.userId).maybeSingle(),
  ]);
  if (resourceResult.error || identityResult.error) throw new Error('LTI binding lookup unavailable');
  const resource = resourceSchema.safeParse(resourceResult.data);
  const identity = identitySchema.safeParse(identityResult.data);
  if (!resource.success || !identity.success || resource.data.org_id !== identity.data.org_id) {
    throw new Error('LTI resource or learner is not registered');
  }
  const orgId = resource.data.org_id;
  // Recheck active membership, even though the FK prevents orphaned bindings.
  const [organization, membership] = await Promise.all([
    service.from('organizations').select('id').eq('id', orgId).eq('status', 'active').maybeSingle(),
    service.from('org_members').select('user_id').eq('org_id', orgId)
      .eq('user_id', identity.data.user_id).maybeSingle(),
  ]);
  if (organization.error || membership.error) throw new Error('LTI membership lookup unavailable');
  if (!organization.data || !membership.data) throw new Error('LTI learner access is inactive');
  return {
    resourceBindingId: resource.data.id,
    userBindingId: identity.data.id,
    orgId,
    stageId: resource.data.stage_id,
    userId: identity.data.user_id,
    lmsSubject: launch.userId,
    clientId: platform.clientId,
  };
}

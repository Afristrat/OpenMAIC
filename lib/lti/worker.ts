import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import { getPlatformConfig } from './index';
import { AGS_SCORE_SCOPE, submitGrade, type GradeDeliveryResult } from './grade-service';

const log = createLogger('LTI-Worker');
const jobSchema = z.object({
  id: z.uuid(), lease_id: z.uuid(), client_id: z.string().min(1), org_id: z.uuid(),
  user_binding_id: z.uuid(), resource_binding_id: z.uuid(), line_item_url: z.string().url(),
  score: z.coerce.number().min(0).max(100), score_changed_at: z.string(),
});

export async function deliverNextLtiGrade(): Promise<boolean> {
  const service = createServiceSupabaseClient();
  const claim = await service.rpc('claim_lti_grade');
  if (claim.error) throw new Error('LTI queue claim failed');
  if (!Array.isArray(claim.data)) throw new Error('Invalid LTI queue response');
  if (claim.data.length === 0) return false;
  const job = jobSchema.parse(claim.data[0]);
  const [platform, user, resource, organization] = await Promise.all([
    getPlatformConfig(job.client_id),
    service.from('lti_user_bindings').select('user_id,lms_subject').eq('id',job.user_binding_id).eq('org_id',job.org_id).maybeSingle(),
    service.from('lti_resource_bindings').select('resource_link_id').eq('id',job.resource_binding_id).eq('org_id',job.org_id).maybeSingle(),
    service.from('organizations').select('status').eq('id',job.org_id).maybeSingle(),
  ]);
  if (user.error || resource.error || organization.error) throw new Error('LTI delivery scope lookup failed');
  let result: GradeDeliveryResult = { success:false,retryable:false,error:'LTI delivery access inactive' };
  if (platform && user.data && resource.data && organization.data?.status === 'active') {
    result = await submitGrade(platform,job.line_item_url,{
      userId:user.data.lms_subject,scoreGiven:job.score,scoreMaximum:100,
      activityProgress:'Completed',gradingProgress:'FullyGraded',
    },{
      qalemUserId:user.data.user_id,resourceLinkId:resource.data.resource_link_id,
      timestamp:job.score_changed_at,scopes:[AGS_SCORE_SCOPE],
    });
  }
  const completed = await service.rpc('finish_lti_grade',{
    p_id:job.id,p_lease:job.lease_id,p_success:result.success,p_retryable:result.retryable,p_error:result.error,
  });
  if (completed.error || completed.data !== true) throw new Error('LTI delivery acknowledgement failed');
  return true;
}

/** SQL leases coordinate processes. This loop never overlaps itself. */
export function startLtiGradeWorker(): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      try {
        for (let count=0;count<10 && !stopped;count++) {
          if (!await deliverNextLtiGrade()) break;
        }
      } catch { log.error('LTI delivery iteration failed; durable lease retained'); }
    })().finally(() => { running=undefined; });
  };
  const timer = setInterval(tick,5000);
  tick();
  return async () => { stopped=true;clearInterval(timer);await running; };
}

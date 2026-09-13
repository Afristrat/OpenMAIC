import { shouldDeferDelivery } from '@/lib/notifications/delivery-window';
import {
  LearnerCourseResumeAccessError,
  resolveLearnerCourseResume,
} from '@/lib/server/learner-course-resume';
import { claimNotificationDeliverySlot } from '@/lib/server/notification-delivery-policy';
import { sendWebPushToUser } from '@/lib/server/web-push';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { CourseResumeDelivery } from '@/lib/supabase/types';

export async function claimDueCourseResumeDeliveries(
  targetTime = new Date(),
): Promise<CourseResumeDelivery[]> {
  const { data, error } = await createServiceSupabaseClient().rpc(
    'claim_due_course_resume_deliveries',
    { p_now: targetTime.toISOString() },
  );
  if (error) throw new Error('Course resume delivery claim failed');
  return data ?? [];
}

async function cancelDelivery(deliveryId: string): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('course_resume_deliveries')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .is('sent_at', null)
    .is('cancelled_at', null);
  if (error) throw new Error('Course resume delivery cancellation failed');
}

export async function deliverCourseResumeDelivery(deliveryId: string): Promise<void> {
  const service = createServiceSupabaseClient();
  const { data: delivery, error: deliveryError } = await service
    .from('course_resume_deliveries')
    .select('id, course_id, user_id, sent_at, cancelled_at')
    .eq('id', deliveryId)
    .maybeSingle();
  if (deliveryError) throw new Error('Course resume delivery lookup failed');
  if (!delivery || delivery.sent_at || delivery.cancelled_at) return;

  const { data: resume, error: resumeError } = await service
    .from('learner_course_resumes')
    .select('course_id, org_id, user_id, completed_at, abandoned_at')
    .eq('course_id', delivery.course_id)
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (resumeError) throw new Error('Learner resume lookup failed');
  if (!resume || resume.completed_at || resume.abandoned_at) {
    await cancelDelivery(delivery.id);
    return;
  }

  try {
    await resolveLearnerCourseResume({
      actorId: delivery.user_id,
      courseId: delivery.course_id,
      orgId: resume.org_id,
    });
  } catch (error) {
    if (error instanceof LearnerCourseResumeAccessError) {
      await cancelDelivery(delivery.id);
      return;
    }
    throw error;
  }

  const { data: preferences, error: preferencesError } = await service
    .from('review_notification_preferences')
    .select('timezone, quiet_start, quiet_end, paused_until')
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (preferencesError) throw new Error('Course resume delivery preferences lookup failed');
  const { data: coursePreferences, error: coursePreferencesError } = await service
    .from('course_notification_preferences')
    .select('paused_until')
    .eq('course_id', delivery.course_id)
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (coursePreferencesError) throw new Error('Course notification preferences lookup failed');
  if (coursePreferences?.paused_until && new Date(coursePreferences.paused_until).getTime() > Date.now()) {
    return;
  }
  if (
    preferences &&
    shouldDeferDelivery(new Date(), {
      timezone: preferences.timezone ?? 'UTC',
      quietStart: preferences.quiet_start,
      quietEnd: preferences.quiet_end,
      pausedUntil: preferences.paused_until,
    })
  ) {
    return;
  }
  if (
    !(await claimNotificationDeliverySlot({
      userId: delivery.user_id,
      source: 'course_resume_delivery',
      sourceId: delivery.id,
    }))
  ) {
    return;
  }

  const results = await sendWebPushToUser(delivery.user_id, {
    title: 'Qalem',
    body: 'Une activité vous attend.',
    targetUrl:
      `/app?learnerResumeCourseId=${encodeURIComponent(delivery.course_id)}` +
      `&learnerResumeOrgId=${encodeURIComponent(resume.org_id)}`,
    tag: `course-resume-delivery-${delivery.id}`,
  });
  if (!results.some((result) => result.status === 'accepted')) {
    throw new Error('No active Web Push subscription accepted the course resume delivery');
  }
  const { error: completionError } = await service
    .from('course_resume_deliveries')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', delivery.id)
    .is('sent_at', null)
    .is('cancelled_at', null);
  if (completionError) throw new Error('Course resume delivery completion failed');
}

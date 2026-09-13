import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { LearnerCourseResume } from '@/lib/supabase/types';

const activitySchema = z.enum(['scene', 'discussion', 'quiz', 'resource']);
const recordSchema = z.object({
  actorId: z.string().uuid(),
  courseId: z.string().uuid(),
  orgId: z.string().uuid(),
  sceneId: z.string().trim().min(1).max(256),
  activity: activitySchema,
  activityState: z.record(z.string(), z.unknown()),
  positionMs: z.number().int().min(0),
});
const lookupSchema = recordSchema.pick({ actorId: true, courseId: true, orgId: true });

export class LearnerCourseResumeAccessError extends Error {
  constructor() {
    super('Learner resume target is unavailable');
  }
}

export async function saveLearnerCourseResume(input: z.input<typeof recordSchema>) {
  const value = recordSchema.parse(input);
  const result = await createServiceSupabaseClient()
    .rpc('record_learner_course_resume', {
      p_actor: value.actorId,
      p_course: value.courseId,
      p_org: value.orgId,
      p_scene: value.sceneId,
      p_activity: value.activity,
      p_state: value.activityState,
      p_position_ms: value.positionMs,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error?.code === '42501') throw new LearnerCourseResumeAccessError();
  if (result.error || !result.data) throw new Error('Learner resume could not be saved');
  return result.data;
}

export async function resolveLearnerCourseResume(input: z.input<typeof lookupSchema>) {
  const value = lookupSchema.parse(input);
  const result = await createServiceSupabaseClient()
    .rpc('resolve_learner_course_resume', {
      p_actor: value.actorId,
      p_course: value.courseId,
      p_org: value.orgId,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error?.code === '42501') throw new LearnerCourseResumeAccessError();
  if (result.error) throw new Error('Learner resume could not be resolved');
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return row;
}

export async function completeLearnerCourseResume(input: z.input<typeof lookupSchema>) {
  const value = lookupSchema.parse(input);
  const result = await createServiceSupabaseClient()
    .rpc('complete_learner_course_resume', {
      p_actor: value.actorId,
      p_course: value.courseId,
      p_org: value.orgId,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error?.code === '42501') throw new LearnerCourseResumeAccessError();
  if (result.error || !result.data) throw new Error('Learner resume could not be completed');
  return result.data;
}

import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const courseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
  source_manifest_id: z.string().uuid().nullable(),
  outline: z.record(z.string(), z.unknown()),
  status: z.enum(['draft', 'ready']),
});

export class CourseAccessError extends Error {
  constructor() {
    super('Course unavailable for generation');
  }
}

/** Rechecked by the worker as queued requests can outlive a membership or ownership change. */
export async function loadOwnedCourseForGeneration(
  courseId: string,
  orgId: string,
  ownerId?: string,
) {
  if (!ownerId) throw new CourseAccessError();
  const db = createServiceSupabaseClient();
  const membership = await db
    .from('org_members')
    .select('role, organizations!inner(status)')
    .eq('user_id', ownerId)
    .eq('org_id', orgId)
    .eq('organizations.status', 'active')
    .in('role', ['admin', 'manager', 'author'])
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (membership.error) throw new Error('Course authorization unavailable');
  if (!membership.data) throw new CourseAccessError();
  const result = await db
    .from('courses')
    .select('id, title, language, source_manifest_id, outline, status')
    .eq('id', courseId)
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .in('status', ['draft', 'ready'])
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (result.error) throw new Error('Course lookup unavailable');
  if (!result.data) throw new CourseAccessError();
  return courseSchema.parse(result.data);
}

export async function assertCourseGenerationAccess(
  input: { courseId?: string; orgId: string; sourceManifestId?: string },
  ownerId?: string,
) {
  if (!input.courseId) return;
  const course = await loadOwnedCourseForGeneration(input.courseId, input.orgId, ownerId);
  if (course.source_manifest_id !== (input.sourceManifestId ?? null)) throw new CourseAccessError();
}

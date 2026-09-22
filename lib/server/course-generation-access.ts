import { z } from 'zod';
import { isSuperAdminEmail } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const courseSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
  source_manifest_id: z.string().uuid().nullable(),
  outline: z.record(z.string(), z.unknown()),
  status: z.enum(['draft', 'ready']),
  source_kind: z.enum(['imported', 'generated', 'catalog_copy']),
  import_id: z.string().uuid().nullable(),
});

export class CourseAccessError extends Error {
  constructor() {
    super('Course unavailable for generation');
  }
}

export class FreeCourseLimitError extends Error {
  constructor() {
    super('Free course limit reached');
  }
}

async function isSuperAdminUser(ownerId: string): Promise<boolean> {
  const db = createServiceSupabaseClient();
  const { data: actor, error } = await db.auth.admin.getUserById(ownerId);
  if (error) throw new Error('Course authorization unavailable');
  return isSuperAdminEmail(actor.user.email ?? '');
}

const AUTHORING_ROLES = ['admin', 'manager', 'formateur'] as const;

export async function resolveGenerationResourceOwner(input: {
  actorId: string;
  orgId: string;
  courseId?: string;
}): Promise<string> {
  if (!(await isSuperAdminUser(input.actorId))) return input.actorId;

  const db = createServiceSupabaseClient();
  if (input.courseId) {
    const course = await db
      .from('courses')
      .select('owner_id')
      .eq('id', input.courseId)
      .eq('org_id', input.orgId)
      .maybeSingle();
    if (course.error) throw new Error('Course ownership lookup unavailable');
    if (!course.data?.owner_id) throw new CourseAccessError();
    return course.data.owner_id;
  }

  const memberships = await db
    .from('org_members')
    .select('user_id, role, created_at')
    .eq('org_id', input.orgId)
    .in('role', [...AUTHORING_ROLES])
    .order('created_at', { ascending: true });
  if (memberships.error) throw new Error('Organization ownership lookup unavailable');
  const roleRank = new Map<string, number>([
    ['admin', 0],
    ['manager', 1],
    ['formateur', 2],
  ]);
  const owner = memberships.data
    ?.slice()
    .sort((left, right) => (roleRank.get(left.role) ?? 99) - (roleRank.get(right.role) ?? 99))[0];
  if (!owner?.user_id) throw new CourseAccessError();
  return owner.user_id;
}

/** Rechecked by the worker as queued requests can outlive a membership or ownership change. */
export async function loadOwnedCourseForGeneration(
  courseId: string,
  orgId: string,
  ownerId?: string,
) {
  if (!ownerId) throw new CourseAccessError();
  await assertGenerationAuthor(orgId, ownerId);
  const isSuperAdmin = await isSuperAdminUser(ownerId);
  const db = createServiceSupabaseClient();
  let query = db
    .from('courses')
    .select(
      'id, owner_id, title, language, source_manifest_id, outline, status, source_kind, import_id',
    )
    .eq('id', courseId)
    .eq('org_id', orgId)
    .in('status', ['draft', 'ready']);
  if (!isSuperAdmin) query = query.eq('owner_id', ownerId);
  const result = await query.abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (result.error) throw new Error('Course lookup unavailable');
  if (!result.data) throw new CourseAccessError();
  return courseSchema.parse(result.data);
}

async function assertGenerationAuthor(orgId: string, ownerId?: string) {
  if (!ownerId) throw new CourseAccessError();
  if (await isSuperAdminUser(ownerId)) return;
  const db = createServiceSupabaseClient();
  const membership = await db
    .from('org_members')
    .select('role, organizations!inner(status)')
    .eq('user_id', ownerId)
    .eq('org_id', orgId)
    .eq('organizations.status', 'active')
    .in('role', [...AUTHORING_ROLES])
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (membership.error) throw new Error('Course authorization unavailable');
  if (!membership.data) throw new CourseAccessError();
}

async function assertFreeCourseLimit(orgId: string) {
  const db = createServiceSupabaseClient();
  const organization = await db.from('organizations').select('plan').eq('id', orgId).maybeSingle();
  if (organization.error || !organization.data) throw new Error('Course authorization unavailable');
  if (organization.data.plan !== 'free') return;
  const courses = await db
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if (courses.error) throw new Error('Course quota unavailable');
  if ((courses.count ?? 0) >= 3) throw new FreeCourseLimitError();
}

export async function assertCourseGenerationAccess(
  input: { courseId?: string; orgId: string; sourceManifestId?: string },
  ownerId?: string,
) {
  if (!input.courseId) {
    await assertGenerationAuthor(input.orgId, ownerId);
    await assertFreeCourseLimit(input.orgId);
    return;
  }
  const course = await loadOwnedCourseForGeneration(input.courseId, input.orgId, ownerId);
  if (course.source_manifest_id !== (input.sourceManifestId ?? null)) throw new CourseAccessError();
}

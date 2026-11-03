import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasStageGrant } from '@/lib/server/stage-grants';

/**
 * Whether the authenticated caller was given THIS classroom individually (stage_grants).
 * Read-only participation: it never implies organization membership, other classrooms, chat
 * budget or authorship.
 */
export async function hasCallerStageGrant(stageId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return false;
  return hasStageGrant(stageId, user.id);
}

/** A verified share grants participation, never authorship of the source. */
export async function hasClassroomShareAccess(stageId: string, orgId?: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return false;
  let query = supabase
    .from('shared_classrooms')
    .select('id,organizations!inner(status,org_members!inner(user_id))')
    .eq('stage_id', stageId)
    .eq('authorization_verified', true)
    .in('visibility', ['organization', 'public'])
    .eq('organizations.status', 'active')
    .eq('organizations.org_members.user_id', user.id);
  if (orgId !== undefined) query = query.eq('org_id', orgId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error('Classroom sharing verification unavailable');
  if (data) return true;
  // Without an organization context (media, attachments) a classroom received individually
  // (stage_grants) is readable too; with one, only an organization share counts.
  return orgId === undefined && hasStageGrant(stageId, user.id);
}

import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  return Boolean(data);
}

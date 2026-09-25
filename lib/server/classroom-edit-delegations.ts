import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type ClassroomEditDelegationStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface ClassroomEditDelegationRecord {
  id: string;
  stageId: string;
  requesterId: string;
  requesterName: string;
  status: ClassroomEditDelegationStatus;
  requestedAt: string;
  expiresAt: string | null;
}

export interface ClassroomEditDelegationState {
  role: string | null;
  canRequest: boolean;
  canManage: boolean;
  requests: ClassroomEditDelegationRecord[];
}

interface DelegationRow {
  id: string;
  stage_id: string;
  requester_id: string;
  status: ClassroomEditDelegationStatus;
  requested_at: string;
  expires_at: string | null;
}

async function activeMembershipRole(userId: string, orgId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations!inner(status)')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('organizations.status', 'active')
    .maybeSingle();
  if (error) throw new Error(`Failed to read tenant membership: ${error.message}`);
  return typeof data?.role === 'string' ? data.role : null;
}

export async function hasActiveClassroomEditDelegation(
  classroomId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  if ((await activeMembershipRole(userId, orgId)) !== 'formateur') return false;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('classroom_edit_delegations')
    .select('id')
    .eq('stage_id', classroomId)
    .eq('org_id', orgId)
    .eq('requester_id', userId)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .limit(1);
  if (error) throw new Error(`Failed to verify classroom edit delegation: ${error.message}`);
  return Boolean(data?.length);
}

export async function readClassroomEditDelegationState(
  classroomId: string,
  orgId: string,
  userId: string,
): Promise<ClassroomEditDelegationState> {
  const role = await activeMembershipRole(userId, orgId);
  const canManage = role === 'admin' || role === 'manager';
  const canRequest = role === 'formateur';
  if (!canManage && !canRequest) return { role, canRequest, canManage, requests: [] };

  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('classroom_edit_delegations')
    .select('id, stage_id, requester_id, status, requested_at, expires_at')
    .eq('stage_id', classroomId)
    .eq('org_id', orgId)
    .order('requested_at', { ascending: false });
  if (canRequest) query = query.eq('requester_id', userId);
  const { data, error } = await query.limit(canManage ? 50 : 10);
  if (error) throw new Error(`Failed to read classroom edit delegations: ${error.message}`);

  const rows = (data ?? []) as DelegationRow[];
  const requesterIds = [...new Set(rows.map((row) => row.requester_id))];
  const { data: profiles, error: profileError } = requesterIds.length
    ? await supabase.from('profiles').select('id, nickname').in('id', requesterIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`Failed to read trainer profiles: ${profileError.message}`);
  const names = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.nickname?.trim() || 'Formateur']),
  );

  return {
    role,
    canRequest,
    canManage,
    requests: rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      requesterId: row.requester_id,
      requesterName: names.get(row.requester_id) ?? 'Formateur',
      status: row.status,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
    })),
  };
}

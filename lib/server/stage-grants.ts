import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * Droit de lecture d'UNE formation pour UNE personne, hors adhésion à l'organisation
 * (table `stage_grants`, écriture serveur seule). Le bénéficiaire lit cette formation et
 * aucune autre : il n'est ni membre ni destinataire d'un partage d'organisation.
 */

export interface StageGrantRecord {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface SharedWithMeItem {
  stageId: string;
  name: string;
  description: string | null;
  language: string | null;
  sharedAt: string;
}

export interface StageInvitationRecord {
  id: string;
  email: string;
  expiresAt: string;
}

export type GrantByEmailResult =
  | { status: 'granted' | 'already'; userId: string }
  | { status: 'invited'; invitationId: string; token: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeShareEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export async function hasStageGrant(stageId: string, userId: string): Promise<boolean> {
  const { data, error } = await createServiceSupabaseClient()
    .from('stage_grants')
    .select('stage_id')
    .eq('stage_id', stageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to verify stage grant: ${error.message}`);
  return Boolean(data);
}

export async function grantStageByEmail(input: {
  stageId: string;
  email: string;
  grantedBy: string;
}): Promise<GrantByEmailResult> {
  const supabase = createServiceSupabaseClient();
  const { data: userId, error: lookupError } = await supabase.rpc('find_user_id_by_email', {
    p_email: input.email,
  });
  if (lookupError) throw new Error(`Failed to resolve account: ${lookupError.message}`);
  if (typeof userId !== 'string') return inviteStageByEmail(input);

  const { data: existing, error: existingError } = await supabase
    .from('stage_grants')
    .select('stage_id')
    .eq('stage_id', input.stageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to read stage grant: ${existingError.message}`);
  if (existing) return { status: 'already', userId };

  const { error } = await supabase
    .from('stage_grants')
    .insert({ stage_id: input.stageId, user_id: userId, granted_by: input.grantedBy });
  // 23505 : un partage concurrent a déjà créé le droit, le résultat est identique.
  if (error && error.code !== '23505') throw new Error(`Failed to grant stage: ${error.message}`);
  return { status: error ? 'already' : 'granted', userId };
}

export async function revokeStageGrant(stageId: string, userId: string): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('stage_grants')
    .delete()
    .eq('stage_id', stageId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to revoke stage grant: ${error.message}`);
}

export async function listStageGrants(stageId: string): Promise<StageGrantRecord[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('stage_grants')
    .select('user_id, created_at')
    .eq('stage_id', stageId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list stage grants: ${error.message}`);
  const rows = data ?? [];
  const profileIds = rows.map((row) => String(row.user_id));
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from('profiles').select('id, nickname').in('id', profileIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`Failed to read grantee profiles: ${profileError.message}`);
  const nicknames = new Map((profiles ?? []).map((p) => [String(p.id), p.nickname?.trim() ?? '']));
  return Promise.all(
    rows.map(async (row) => {
      const userId = String(row.user_id);
      const { data: account } = await supabase.auth.admin.getUserById(userId);
      const email = account.user?.email ?? '';
      return {
        userId,
        email,
        displayName: nicknames.get(userId) || email,
        createdAt: String(row.created_at),
      };
    }),
  );
}

export async function listSharedWithUser(userId: string): Promise<SharedWithMeItem[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('stage_grants')
    .select('stage_id, created_at, stages!inner(name, description, language)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list shared classrooms: ${error.message}`);
  return (data ?? []).map((row) => {
    const stage = Array.isArray(row.stages) ? row.stages[0] : row.stages;
    return {
      stageId: String(row.stage_id),
      name: String(stage?.name ?? ''),
      description: stage?.description ?? null,
      language: stage?.language ?? null,
      sharedAt: String(row.created_at),
    };
  });
}

/**
 * Adresse sans compte : une invitation PAR FORMATION (jamais d'adhésion à l'organisation).
 * Une invitation encore valable pour la même adresse est réutilisée (renvoi du même lien).
 */
async function inviteStageByEmail(input: {
  stageId: string;
  email: string;
  grantedBy: string;
}): Promise<GrantByEmailResult> {
  const supabase = createServiceSupabaseClient();
  const { error: purgeError } = await supabase
    .from('stage_grant_invitations')
    .delete()
    .eq('stage_id', input.stageId)
    .eq('email', input.email)
    .is('used_at', null)
    .lte('expires_at', new Date().toISOString());
  if (purgeError) throw new Error(`Failed to purge expired invitation: ${purgeError.message}`);

  const { data: pending, error: pendingError } = await supabase
    .from('stage_grant_invitations')
    .select('id, token')
    .eq('stage_id', input.stageId)
    .eq('email', input.email)
    .is('used_at', null)
    .maybeSingle();
  if (pendingError) throw new Error(`Failed to read invitation: ${pendingError.message}`);
  if (pending) {
    return { status: 'invited', invitationId: String(pending.id), token: String(pending.token) };
  }

  const { data: created, error } = await supabase
    .from('stage_grant_invitations')
    .insert({ stage_id: input.stageId, email: input.email, created_by: input.grantedBy })
    .select('id, token')
    .single();
  if (error || !created) throw new Error(`Failed to invite: ${error?.message ?? 'no row'}`);
  return { status: 'invited', invitationId: String(created.id), token: String(created.token) };
}

export async function listStageInvitations(stageId: string): Promise<StageInvitationRecord[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from('stage_grant_invitations')
    .select('id, email, expires_at')
    .eq('stage_id', stageId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list stage invitations: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    expiresAt: String(row.expires_at),
  }));
}

export async function revokeStageInvitation(stageId: string, invitationId: string): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('stage_grant_invitations')
    .delete()
    .eq('stage_id', stageId)
    .eq('id', invitationId)
    .is('used_at', null);
  if (error) throw new Error(`Failed to revoke stage invitation: ${error.message}`);
}

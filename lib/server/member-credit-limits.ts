import { CREDIT_MICROUNITS, microunitsToCredits } from '@/lib/billing/credits';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * Plafond mensuel de crédits par membre (table `tenant_member_credit_limits`, appliqué dans la
 * réservation de consommation `reserve_tenant_usage`). Sans plafond, le membre consomme dans la
 * limite du solde commun de l'organisation.
 */

export interface MemberCreditRow {
  userId: string;
  nickname: string | null;
  role: string;
  /** Plafond mensuel en crédits ; null = aucun plafond. */
  capCredits: number | null;
  /** Consommation du mois civil UTC en cours, en crédits. */
  spentCredits: number;
}

export interface MemberCreditLimitInput {
  userId: string;
  /** Crédits par mois ; null retire le plafond. */
  capCredits: number | null;
}

export async function listMemberCredits(orgId: string): Promise<MemberCreditRow[]> {
  const supabase = createServiceSupabaseClient();
  const [members, limits, usage] = await Promise.all([
    supabase.from('org_members').select('user_id, role').eq('org_id', orgId),
    supabase
      .from('tenant_member_credit_limits')
      .select('user_id, monthly_cap_microunits')
      .eq('org_id', orgId),
    supabase.rpc('member_credit_usage_month', { p_org_id: orgId }),
  ]);
  if (members.error) throw new Error(`Failed to list members: ${members.error.message}`);
  if (limits.error) throw new Error(`Failed to list credit limits: ${limits.error.message}`);
  if (usage.error) throw new Error(`Failed to read member usage: ${usage.error.message}`);

  const ids = (members.data ?? []).map((m) => m.user_id);
  const { data: profiles, error: profilesError } = ids.length
    ? await supabase.from('profiles').select('id, nickname').in('id', ids)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Failed to read profiles: ${profilesError.message}`);

  const nickname = new Map((profiles ?? []).map((p) => [p.id, p.nickname as string | null]));
  const cap = new Map(
    (limits.data ?? []).map((l) => [l.user_id, microunitsToCredits(l.monthly_cap_microunits)]),
  );
  const spent = new Map(
    ((usage.data ?? []) as { user_id: string; spent_microunits: number | string }[]).map((u) => [
      u.user_id,
      microunitsToCredits(u.spent_microunits),
    ]),
  );
  return (members.data ?? []).map((m) => ({
    userId: m.user_id,
    nickname: nickname.get(m.user_id) ?? null,
    role: m.role,
    capCredits: cap.get(m.user_id) ?? null,
    spentCredits: spent.get(m.user_id) ?? 0,
  }));
}

/**
 * Applique les plafonds à des membres de l'organisation. Un identifiant qui n'est pas membre
 * est refusé en bloc : rien n'est écrit.
 */
export async function setMemberCreditLimits(
  orgId: string,
  limits: MemberCreditLimitInput[],
  setBy: string,
): Promise<{ status: 'ok' } | { status: 'not-member'; userId: string }> {
  const supabase = createServiceSupabaseClient();
  const { data: members, error } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in(
      'user_id',
      limits.map((l) => l.userId),
    );
  if (error) throw new Error(`Failed to verify members: ${error.message}`);
  const known = new Set((members ?? []).map((m) => m.user_id));
  const stranger = limits.find((l) => !known.has(l.userId));
  if (stranger) return { status: 'not-member', userId: stranger.userId };

  const toSet = limits.filter((l) => l.capCredits !== null);
  const toClear = limits.filter((l) => l.capCredits === null).map((l) => l.userId);
  if (toSet.length > 0) {
    const { error: upsertError } = await supabase.from('tenant_member_credit_limits').upsert(
      toSet.map((l) => ({
        org_id: orgId,
        user_id: l.userId,
        monthly_cap_microunits: Math.round((l.capCredits ?? 0) * CREDIT_MICROUNITS),
        set_by: setBy,
        updated_at: new Date().toISOString(),
      })),
    );
    if (upsertError) throw new Error(`Failed to set credit limits: ${upsertError.message}`);
  }
  if (toClear.length > 0) {
    const { error: deleteError } = await supabase
      .from('tenant_member_credit_limits')
      .delete()
      .eq('org_id', orgId)
      .in('user_id', toClear);
    if (deleteError) throw new Error(`Failed to clear credit limits: ${deleteError.message}`);
  }
  return { status: 'ok' };
}

import { NextRequest } from 'next/server';
import { isSuperAdminEmail, requireAuth } from '@/lib/api/auth';
import { microunitsToCredits } from '@/lib/billing/credits';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ReconciliationRow = {
  balance_microunits: number | string;
  ledger_balance_microunits: number | string;
  consistent: boolean;
};

export async function GET(request: NextRequest): Promise<Response> {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing orgId parameter');

  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const superAdmin = isSuperAdminEmail(auth.user.email);
  let canReadTenantEntries = superAdmin;
  if (!superAdmin) {
    const serverSupabase = await createServerSupabaseClient();
    const { data: membership, error: membershipError } = await serverSupabase
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    const organization = Array.isArray(membership?.organizations)
      ? membership.organizations[0]
      : membership?.organizations;
    if (membershipError || !membership || organization?.status !== 'active') {
      return apiError(API_ERROR_CODES.UNAUTHORIZED, 403, 'Organization membership required');
    }
    canReadTenantEntries = ['admin', 'manager'].includes(membership.role);
  }

  const supabase = createServiceSupabaseClient();
  let entriesQuery = supabase
    .from('tenant_credit_ledger')
    .select(
      'id, actor_user_id, entry_type, delta_microunits, billable_unit, quantity, reason, reference_id, reversal_of, created_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!canReadTenantEntries) entriesQuery = entriesQuery.eq('actor_user_id', auth.user.id);
  const [{ data: reconciliation, error: reconciliationError }, { data: entries, error }] =
    await Promise.all([
      supabase.rpc('reconcile_tenant_credit_wallet', { tenant_id: orgId }).single(),
      entriesQuery,
    ]);

  if (reconciliationError || error || !reconciliation) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read tenant credits');
  }
  const state = reconciliation as ReconciliationRow;
  if (!state.consistent) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 409, 'Credit ledger divergence');
  }

  const actorIds = [...new Set((entries ?? []).map((entry) => entry.actor_user_id))];
  const entryIds = (entries ?? []).map((entry) => entry.id);
  const [profilesResult, reservationsResult] = await Promise.all([
    actorIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('profiles').select('id, nickname').in('id', actorIds),
    entryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('tenant_usage_reservations')
          .select(
            'reservation_debit_id, actual_debit_id, status, valuation_status, valuation_issue',
          )
          .eq('org_id', orgId)
          .or(
            `reservation_debit_id.in.(${entryIds.join(',')}),actual_debit_id.in.(${entryIds.join(',')})`,
          ),
  ]);
  if (profilesResult.error || reservationsResult.error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to enrich tenant credits');
  }
  const nicknameByUser = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.nickname]),
  );
  const reservationByLedger = new Map<
    string,
    {
      status: string;
      valuation_status: string;
      valuation_issue: string | null;
    }
  >();
  for (const reservation of reservationsResult.data ?? []) {
    const value = {
      status: reservation.status,
      valuation_status: reservation.valuation_status,
      valuation_issue: reservation.valuation_issue,
    };
    if (reservation.reservation_debit_id) {
      reservationByLedger.set(reservation.reservation_debit_id, value);
    }
    if (reservation.actual_debit_id) reservationByLedger.set(reservation.actual_debit_id, value);
  }

  return apiSuccess({
    balanceMicrounits: Number(state.balance_microunits),
    balanceCredits: microunitsToCredits(state.balance_microunits),
    scope: canReadTenantEntries ? 'tenant' : 'personal',
    entries: (entries ?? []).map((entry) => ({
      ...entry,
      actorNickname: nicknameByUser.get(entry.actor_user_id) ?? null,
      usageStatus: reservationByLedger.get(entry.id) ?? null,
    })),
  });
}

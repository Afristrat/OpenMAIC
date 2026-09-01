import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { microunitsToCredits } from '@/lib/billing/credits';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type ReconciliationRow = {
  balance_microunits: number | string;
  ledger_balance_microunits: number | string;
  consistent: boolean;
};

export async function GET(request: NextRequest): Promise<Response> {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing orgId parameter');

  const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const [{ data: reconciliation, error: reconciliationError }, { data: entries, error }] =
    await Promise.all([
      supabase.rpc('reconcile_tenant_credit_wallet', { tenant_id: orgId }).single(),
      supabase
        .from('tenant_credit_ledger')
        .select(
          'id, entry_type, delta_microunits, billable_unit, quantity, reason, reference_id, reversal_of, created_at',
        )
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  if (reconciliationError || error || !reconciliation) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read tenant credits');
  }
  const state = reconciliation as ReconciliationRow;
  if (!state.consistent) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 409, 'Credit ledger divergence');
  }

  return apiSuccess({
    balanceMicrounits: Number(state.balance_microunits),
    balanceCredits: microunitsToCredits(state.balance_microunits),
    entries: entries ?? [],
  });
}

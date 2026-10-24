import { CREDIT_MICROUNITS } from '@/lib/billing/credits';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import {
  DEFAULT_METERED_MAX_OUTPUT_TOKENS,
  estimateMaxInputTokens,
} from '@/lib/billing/llm-reservation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type Rate = { credit_microunits: number; quantity_basis: number };
export type CreditRates = { llm_input_token?: Rate; llm_output_token?: Rate };

export type CreditStatus = {
  balanceMicrounits: number;
  enforcementEnabled: boolean;
  recordingOnly: boolean;
  minimumRequiredMicrounits: number | null;
  lowBalanceThresholdMicrounits: number | null;
  blocked: boolean;
  lowBalance: boolean;
};

function cost(rate: Rate, quantity: number): number {
  return Math.ceil((quantity / rate.quantity_basis) * rate.credit_microunits);
}

/**
 * Besoin minimal : la réservation d'un seul appel LLM de requête vide. En dessous,
 * aucun appel ne peut démarrer. Aucun besoin n'est inventé : sans taux, null.
 */
export function minimumRequiredMicrounits(rates: CreditRates): number | null {
  const { llm_input_token: input, llm_output_token: output } = rates;
  if (!input || !output) return null;
  return cost(input, estimateMaxInputTokens(0)) + cost(output, DEFAULT_METERED_MAX_OUTPUT_TOKENS);
}

export function evaluateCreditGate(input: {
  balanceMicrounits: number;
  minimumRequiredMicrounits: number | null;
  enforcementEnabled: boolean;
  recordingOnly: boolean;
  lowBalanceThresholdMicrounits: number | null;
}): { blocked: boolean; lowBalance: boolean } {
  if (!input.enforcementEnabled || input.recordingOnly)
    return { blocked: false, lowBalance: false };
  const { balanceMicrounits: balance } = input;
  return {
    blocked: input.minimumRequiredMicrounits !== null && balance < input.minimumRequiredMicrounits,
    lowBalance:
      input.lowBalanceThresholdMicrounits !== null && balance < input.lowBalanceThresholdMicrounits,
  };
}

/** Seuil d'alerte en crédits (CREDITS_LOW_BALANCE_THRESHOLD) ; à défaut, deux fois le besoin minimal. */
function resolveLowBalanceThreshold(minimum: number | null): number | null {
  const configured = Number(process.env.CREDITS_LOW_BALANCE_THRESHOLD);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.round(configured * CREDIT_MICROUNITS);
  }
  return minimum === null ? null : minimum * 2;
}

type RateRow = {
  billable_unit: string;
  credit_microunits: number | string;
  quantity_basis: number | string;
};

function toRates(rows: RateRow[] | null, fallback: CreditRates = {}): CreditRates {
  const rates: CreditRates = { ...fallback };
  for (const row of rows ?? []) {
    if (row.billable_unit === 'llm_input_token' || row.billable_unit === 'llm_output_token') {
      rates[row.billable_unit] = {
        credit_microunits: Number(row.credit_microunits),
        quantity_basis: Number(row.quantity_basis),
      };
    }
  }
  return rates;
}

export async function fetchCreditStatus(orgId: string): Promise<CreditStatus> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const [control, tenantRates, platformRates, wallet] = await Promise.all([
    supabase.from('tenant_billing_controls').select('*').eq('org_id', orgId).maybeSingle(),
    supabase
      .from('tenant_credit_burn_rates')
      .select('billable_unit, credit_microunits, quantity_basis')
      .eq('org_id', orgId)
      .is('valid_to', null)
      .lte('valid_from', now)
      .order('valid_from', { ascending: true }),
    supabase
      .from('platform_credit_burn_rates')
      .select('billable_unit, credit_microunits, quantity_basis')
      .is('valid_to', null)
      .lte('valid_from', now)
      .order('valid_from', { ascending: true }),
    supabase.rpc('reconcile_tenant_credit_wallet', { tenant_id: orgId }).single(),
  ]);
  if (control.error || tenantRates.error || platformRates.error || wallet.error || !wallet.data) {
    throw new Error('Credit status read failed');
  }
  const state = wallet.data as { balance_microunits: number | string; consistent: boolean };
  if (!state.consistent) throw new Error('Credit ledger divergence');

  const controlRow = control.data as {
    enforcement_enabled?: boolean;
    usage_recording_only?: boolean;
  } | null;
  const enforcementEnabled = controlRow?.enforcement_enabled === true;
  const recordingOnly = controlRow?.usage_recording_only === true;
  const minimum = minimumRequiredMicrounits(
    toRates(tenantRates.data as RateRow[] | null, toRates(platformRates.data as RateRow[] | null)),
  );
  const lowBalanceThresholdMicrounits = resolveLowBalanceThreshold(minimum);
  const balanceMicrounits = Number(state.balance_microunits);
  return {
    balanceMicrounits,
    enforcementEnabled,
    recordingOnly,
    minimumRequiredMicrounits: minimum,
    lowBalanceThresholdMicrounits,
    ...evaluateCreditGate({
      balanceMicrounits,
      minimumRequiredMicrounits: minimum,
      enforcementEnabled,
      recordingOnly,
      lowBalanceThresholdMicrounits,
    }),
  };
}

/** Refuse de lancer un job voué à l'échec ; la même erreur typée que la réservation. */
export async function assertCreditsAvailable(orgId: string): Promise<CreditStatus> {
  const status = await fetchCreditStatus(orgId);
  if (status.blocked && status.minimumRequiredMicrounits !== null) {
    throw new InsufficientCreditsError('INSUFFICIENT_TENANT_CREDITS', {
      balanceMicrounits: status.balanceMicrounits,
      requiredMicrounits: status.minimumRequiredMicrounits,
    });
  }
  return status;
}

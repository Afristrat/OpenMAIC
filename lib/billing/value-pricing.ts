import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { BillableUnit } from '@/lib/billing/credits';

export type MarginSummary = {
  revenueMicrounits: number;
  costMicrounits: number;
  grossMarginMicrounits: number;
  marginBps: number;
  targetMarginBps: number;
  belowTarget: boolean;
};

export type ValuedDebitResult = MarginSummary & {
  ledgerId: string;
  balanceMicrounits: number;
  creditApplied: boolean;
  valuedUsageId: string;
  valuationApplied: boolean;
};

export type MarginBreakdown = Omit<MarginSummary, 'targetMarginBps' | 'belowTarget'> & {
  billableUnit: BillableUnit;
};

type MarginRpcRow = {
  revenue_microunits: number | string;
  cost_microunits: number | string;
  gross_margin_microunits: number | string;
  margin_bps?: number;
  weighted_margin_bps?: number;
  target_margin_bps: number;
  below_target: boolean;
};

function decimalToScaledInteger(value: string, decimals: number): number {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error('Invalid decimal precision');
  const scaled = Number(`${match[1]}${(match[2] ?? '').padEnd(decimals, '0')}`);
  if (!Number.isSafeInteger(scaled)) throw new Error('Decimal amount exceeds safe range');
  return scaled;
}

export function currencyAmountToMicrounits(value: string): number {
  return decimalToScaledInteger(value, 6);
}

export function exchangeRateToNanos(value: string): number {
  return decimalToScaledInteger(value, 9);
}

function mapMargin(row: MarginRpcRow): MarginSummary {
  return {
    revenueMicrounits: Number(row.revenue_microunits),
    costMicrounits: Number(row.cost_microunits),
    grossMarginMicrounits: Number(row.gross_margin_microunits),
    marginBps: Number(row.weighted_margin_bps ?? row.margin_bps ?? 0),
    targetMarginBps: Number(row.target_margin_bps),
    belowTarget: row.below_target,
  };
}

export async function createTenantSellPrice(input: {
  actorUserId: string;
  tenantId: string;
  billableUnit: BillableUnit;
  currency: string;
  priceAmount: string;
  quantityBasis: string;
  validFrom: string;
  commercialRationale: string;
}): Promise<unknown> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_tenant_sell_price', {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_billable_unit: input.billableUnit,
      p_currency: input.currency,
      p_price_microunits: currencyAmountToMicrounits(input.priceAmount),
      p_quantity_basis: input.quantityBasis,
      p_valid_from: input.validFrom,
      p_commercial_rationale: input.commercialRationale,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Sell price creation failed');
  return data;
}

export async function createProviderCostRate(input: {
  actorUserId: string;
  providerId: string;
  modelId: string;
  billableUnit: BillableUnit;
  currency: string;
  costAmount: string;
  quantityBasis: string;
  costSource: 'actual' | 'estimate';
  provenance: string;
  validFrom: string;
}): Promise<unknown> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_provider_cost_rate', {
      p_actor: input.actorUserId,
      p_provider_id: input.providerId,
      p_model_id: input.modelId,
      p_billable_unit: input.billableUnit,
      p_currency: input.currency,
      p_cost_microunits: currencyAmountToMicrounits(input.costAmount),
      p_quantity_basis: input.quantityBasis,
      p_cost_source: input.costSource,
      p_provenance: input.provenance,
      p_valid_from: input.validFrom,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Provider cost creation failed');
  return data;
}

export async function createExchangeRate(input: {
  actorUserId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  provenance: string;
  validFrom: string;
}): Promise<unknown> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_currency_exchange_rate', {
      p_actor: input.actorUserId,
      p_base_currency: input.baseCurrency,
      p_quote_currency: input.quoteCurrency,
      p_rate_nanos: exchangeRateToNanos(input.rate),
      p_provenance: input.provenance,
      p_valid_from: input.validFrom,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Exchange rate creation failed');
  return data;
}

export async function setMarginTarget(input: {
  actorUserId: string;
  targetMarginBps: number;
  rationale: string;
}): Promise<unknown> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('set_margin_target', {
      p_actor: input.actorUserId,
      p_target_margin_bps: input.targetMarginBps,
      p_rationale: input.rationale,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Margin target creation failed');
  return data;
}

export async function debitAndValueTenantUsage(input: {
  actorUserId: string;
  tenantId: string;
  creditMicrounits: number;
  idempotencyKey: string;
  reason: string;
  billableUnit: BillableUnit;
  quantity: number;
  referenceId: string;
  sellCurrency: string;
  providerId: string;
  modelId: string;
  providerCostCurrency: string;
}): Promise<ValuedDebitResult> {
  if (!Number.isSafeInteger(input.creditMicrounits) || input.creditMicrounits <= 0) {
    throw new Error('Invalid credit debit');
  }
  const { data, error } = await createServiceSupabaseClient()
    .rpc('debit_and_value_tenant_usage', {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_credit_microunits: input.creditMicrounits,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
      p_billable_unit: input.billableUnit,
      p_quantity: input.quantity,
      p_reference_id: input.referenceId,
      p_sell_currency: input.sellCurrency,
      p_provider_id: input.providerId,
      p_model_id: input.modelId,
      p_provider_cost_currency: input.providerCostCurrency,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Valued debit failed');
  const row = data as MarginRpcRow & {
    ledger_id: string;
    balance_microunits: number | string;
    credit_applied: boolean;
    valued_usage_id: string;
    valuation_applied: boolean;
  };
  return {
    ...mapMargin(row),
    ledgerId: row.ledger_id,
    balanceMicrounits: Number(row.balance_microunits),
    creditApplied: row.credit_applied,
    valuedUsageId: row.valued_usage_id,
    valuationApplied: row.valuation_applied,
  };
}

export async function getPlatformMargin(from: string, to: string): Promise<MarginSummary> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('platform_margin_summary', { p_from: from, p_to: to })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Platform margin query failed');
  return mapMargin(data as MarginRpcRow);
}

export async function getTenantMargin(
  tenantId: string,
  from: string,
  to: string,
): Promise<MarginSummary> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('tenant_margin_summary', { p_org_id: tenantId, p_from: from, p_to: to })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Tenant margin query failed');
  return mapMargin(data as MarginRpcRow);
}

export async function getTenantMarginBreakdown(
  tenantId: string,
  from: string,
  to: string,
): Promise<MarginBreakdown[]> {
  const { data, error } = await createServiceSupabaseClient().rpc('tenant_margin_breakdown', {
    p_org_id: tenantId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<MarginRpcRow & { billable_unit: BillableUnit; margin_bps: number }>
  ).map((row) => ({
    billableUnit: row.billable_unit,
    revenueMicrounits: Number(row.revenue_microunits),
    costMicrounits: Number(row.cost_microunits),
    grossMarginMicrounits: Number(row.gross_margin_microunits),
    marginBps: row.margin_bps,
  }));
}

export async function getCurrentSellPrices(tenantId: string): Promise<unknown[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from('tenant_sell_prices')
    .select(
      'id, billable_unit, currency, price_microunits, quantity_basis, valid_from, commercial_rationale',
    )
    .eq('org_id', tenantId)
    .is('valid_to', null)
    .order('billable_unit');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCurrentEconomicConfiguration(): Promise<{
  providerCosts: unknown[];
  exchangeRates: unknown[];
}> {
  const supabase = createServiceSupabaseClient();
  const [costs, rates] = await Promise.all([
    supabase
      .from('provider_cost_rates')
      .select(
        'id, provider_id, model_id, billable_unit, currency, cost_microunits, quantity_basis, cost_source, provenance, valid_from',
      )
      .is('valid_to', null)
      .order('provider_id'),
    supabase
      .from('currency_exchange_rates')
      .select('id, base_currency, quote_currency, rate_nanos, provenance, valid_from')
      .is('valid_to', null)
      .order('base_currency'),
  ]);
  if (costs.error || rates.error) {
    throw new Error(
      costs.error?.message ?? rates.error?.message ?? 'Economic configuration query failed',
    );
  }
  return { providerCosts: costs.data ?? [], exchangeRates: rates.data ?? [] };
}

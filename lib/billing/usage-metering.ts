import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { BillableUnit } from '@/lib/billing/credits';
import { nextUsageOperationContext } from '@/lib/billing/usage-context';

export type UsageReservation = {
  enforcementEnabled: boolean;
  reservationId: string | null;
  reservedCreditMicrounits: number;
  applied: boolean;
};

export type UsageSettlement = {
  reservationId: string;
  actualCreditMicrounits: number;
  valuedUsageId: string | null;
  revenueMicrounits: number | null;
  costMicrounits: number | null;
  marginBps: number | null;
  belowTarget: boolean | null;
  valuationStatus: 'valued' | 'pending_configuration';
  valuationIssue: string | null;
  applied: boolean;
};

type ReservationRpcRow = {
  enforcement_enabled: boolean;
  reservation_id: string | null;
  reserved_credit_microunits: number | string;
  applied: boolean;
};

type SettlementRpcRow = {
  reservation_id: string;
  actual_credit_microunits: number | string;
  valued_usage_id: string | null;
  revenue_microunits: number | string | null;
  cost_microunits: number | string | null;
  margin_bps: number | null;
  below_target: boolean | null;
  valuation_status: 'valued' | 'pending_configuration';
  valuation_issue: string | null;
  applied: boolean;
};

function assertQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity !== Number(quantity.toFixed(6))) {
    throw new Error('Invalid metered usage quantity');
  }
}

export async function createTenantCreditBurnRate(input: {
  actorUserId: string;
  tenantId: string;
  billableUnit: BillableUnit;
  creditMicrounits: number;
  quantityBasis: number;
  validFrom: string;
  rationale: string;
}): Promise<unknown> {
  if (!Number.isSafeInteger(input.creditMicrounits) || input.creditMicrounits <= 0) {
    throw new Error('Invalid credit burn rate');
  }
  assertQuantity(input.quantityBasis);
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_tenant_credit_burn_rate', {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_billable_unit: input.billableUnit,
      p_credit_microunits: input.creditMicrounits,
      p_quantity_basis: input.quantityBasis,
      p_valid_from: input.validFrom,
      p_rationale: input.rationale,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Credit burn rate creation failed');
  return data;
}

export async function createPlatformCreditPolicy(input: {
  actorUserId: string;
  calibrationMethod: string;
  rationale: string;
  validFrom: string;
}): Promise<unknown> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_platform_credit_policy', {
      p_actor: input.actorUserId,
      p_calibration_method: input.calibrationMethod,
      p_rationale: input.rationale,
      p_valid_from: input.validFrom,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Credit policy creation failed');
  return data;
}

export async function createPlatformCreditBurnRate(input: {
  actorUserId: string;
  policyId: string;
  billableUnit: BillableUnit;
  creditMicrounits: number;
  quantityBasis: number;
  settlementMode: 'measured_actual' | 'p95_flat_rate';
  observationWindowDays: number;
  provenance: string;
  validFrom: string;
}): Promise<unknown> {
  if (!Number.isSafeInteger(input.creditMicrounits) || input.creditMicrounits <= 0) {
    throw new Error('Invalid platform credit burn rate');
  }
  assertQuantity(input.quantityBasis);
  const { data, error } = await createServiceSupabaseClient()
    .rpc('create_platform_credit_burn_rate', {
      p_actor: input.actorUserId,
      p_policy_id: input.policyId,
      p_billable_unit: input.billableUnit,
      p_credit_microunits: input.creditMicrounits,
      p_quantity_basis: input.quantityBasis,
      p_settlement_mode: input.settlementMode,
      p_observation_window_days: input.observationWindowDays,
      p_provenance: input.provenance,
      p_valid_from: input.validFrom,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Platform burn rate creation failed');
  return data;
}

export async function inheritPlatformCreditBurnRate(input: {
  actorUserId: string;
  tenantId: string;
  billableUnit: BillableUnit;
  validFrom: string;
}): Promise<boolean> {
  const { data, error } = await createServiceSupabaseClient().rpc(
    'inherit_platform_credit_burn_rate',
    {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_billable_unit: input.billableUnit,
      p_valid_from: input.validFrom,
    },
  );
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getPlatformCreditPolicy(): Promise<{
  policy: unknown | null;
  burnRates: unknown[];
  coverage: { activeTenants: number; coveredTenants: number; pendingValuations: number };
}> {
  const supabase = createServiceSupabaseClient();
  const [policy, burnRates, activeTenants, coveredTenants, pendingValuations] = await Promise.all([
    supabase
      .from('platform_credit_policies')
      .select(
        'id, anchor_currency, anchor_cost_microunits, calibration_method, rationale, valid_from',
      )
      .is('valid_to', null)
      .maybeSingle(),
    supabase
      .from('platform_credit_burn_rates')
      .select(
        'id, policy_id, billable_unit, credit_microunits, quantity_basis, settlement_mode, reservation_percentile, observation_window_days, provenance, valid_from',
      )
      .is('valid_to', null)
      .order('billable_unit'),
    supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('tenant_billing_controls')
      .select('org_id, organizations!inner(status)', { count: 'exact', head: true })
      .eq('enforcement_enabled', true)
      .eq('organizations.status', 'active'),
    supabase
      .from('tenant_usage_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('valuation_status', 'pending_configuration')
      .eq('status', 'settled'),
  ]);
  const error =
    policy.error ??
    burnRates.error ??
    activeTenants.error ??
    coveredTenants.error ??
    pendingValuations.error;
  if (error) throw new Error(error.message);
  return {
    policy: policy.data,
    burnRates: burnRates.data ?? [],
    coverage: {
      activeTenants: activeTenants.count ?? 0,
      coveredTenants: coveredTenants.count ?? 0,
      pendingValuations: pendingValuations.count ?? 0,
    },
  };
}

export async function configureTenantUsageBilling(input: {
  actorUserId: string;
  tenantId: string;
  enabled: boolean;
  sellCurrency: string;
  requiredUnits: BillableUnit[];
}): Promise<unknown> {
  if (input.requiredUnits.length === 0) throw new Error('At least one billable unit is required');
  const { data, error } = await createServiceSupabaseClient()
    .rpc('configure_tenant_billing', {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_enabled: input.enabled,
      p_sell_currency: input.sellCurrency,
      p_required_units: input.requiredUnits,
    })
    .single();
  if (error || !data)
    throw new Error(error?.message ?? 'Tenant usage billing configuration failed');
  return data;
}

export async function getTenantUsageBilling(tenantId: string): Promise<{
  control: unknown | null;
  burnRates: unknown[];
  platformBurnRates: unknown[];
}> {
  const supabase = createServiceSupabaseClient();
  const [control, burnRates, platformBurnRates] = await Promise.all([
    supabase
      .from('tenant_billing_controls')
      .select(
        'org_id, enforcement_enabled, sell_currency, required_units, enabled_by, enabled_at, updated_at',
      )
      .eq('org_id', tenantId)
      .maybeSingle(),
    supabase
      .from('tenant_credit_burn_rates')
      .select(
        'id, billable_unit, credit_microunits, quantity_basis, valid_from, rationale, created_by',
      )
      .eq('org_id', tenantId)
      .is('valid_to', null)
      .order('billable_unit'),
    supabase
      .from('platform_credit_burn_rates')
      .select('id, billable_unit, credit_microunits, quantity_basis, settlement_mode, valid_from')
      .is('valid_to', null)
      .order('billable_unit'),
  ]);
  if (control.error || burnRates.error || platformBurnRates.error) {
    throw new Error(
      control.error?.message ??
        burnRates.error?.message ??
        platformBurnRates.error?.message ??
        'Usage billing query failed',
    );
  }
  return {
    control: control.data,
    burnRates: burnRates.data ?? [],
    platformBurnRates: platformBurnRates.data ?? [],
  };
}

export async function reserveTenantUsage(input: {
  actorUserId: string;
  tenantId: string;
  operationKey: string;
  billableUnit: BillableUnit;
  maxQuantity: number;
  providerId: string;
  modelId: string;
  providerCostCurrency: string;
  idempotencyStable: boolean;
}): Promise<UsageReservation> {
  assertQuantity(input.maxQuantity);
  const { data, error } = await createServiceSupabaseClient()
    .rpc('reserve_tenant_usage', {
      p_actor: input.actorUserId,
      p_org_id: input.tenantId,
      p_operation_key: input.operationKey,
      p_billable_unit: input.billableUnit,
      p_max_quantity: input.maxQuantity,
      p_provider_id: input.providerId,
      p_model_id: input.modelId,
      p_provider_cost_currency: input.providerCostCurrency,
      p_idempotency_stable: input.idempotencyStable,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Usage reservation failed');
  const row = data as ReservationRpcRow;
  return {
    enforcementEnabled: row.enforcement_enabled,
    reservationId: row.reservation_id,
    reservedCreditMicrounits: Number(row.reserved_credit_microunits),
    applied: row.applied,
  };
}

export async function settleTenantUsage(
  actorUserId: string,
  reservationId: string,
  actualQuantity: number,
): Promise<UsageSettlement> {
  assertQuantity(actualQuantity);
  const { data, error } = await createServiceSupabaseClient()
    .rpc('settle_tenant_usage', {
      p_actor: actorUserId,
      p_reservation_id: reservationId,
      p_actual_quantity: actualQuantity,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Usage settlement failed');
  const row = data as SettlementRpcRow;
  return {
    reservationId: row.reservation_id,
    actualCreditMicrounits: Number(row.actual_credit_microunits),
    valuedUsageId: row.valued_usage_id,
    revenueMicrounits: row.revenue_microunits === null ? null : Number(row.revenue_microunits),
    costMicrounits: row.cost_microunits === null ? null : Number(row.cost_microunits),
    marginBps: row.margin_bps,
    belowTarget: row.below_target,
    valuationStatus: row.valuation_status,
    valuationIssue: row.valuation_issue,
    applied: row.applied,
  };
}

export async function releaseTenantUsage(
  actorUserId: string,
  reservationId: string,
  reason: string,
): Promise<{ balanceMicrounits: number; applied: boolean }> {
  const { data, error } = await createServiceSupabaseClient()
    .rpc('release_tenant_usage', {
      p_actor: actorUserId,
      p_reservation_id: reservationId,
      p_reason: reason,
    })
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Usage reservation release failed');
  const row = data as { balance_microunits: number | string; applied: boolean };
  return { balanceMicrounits: Number(row.balance_microunits), applied: row.applied };
}

export async function finalizeTenantUsages(
  actorUserId: string,
  reservations: Array<{ reservationId: string; actualQuantity: number }>,
): Promise<void> {
  if (reservations.length === 0) return;
  for (const reservation of reservations) {
    if (reservation.actualQuantity < 0) throw new Error('Invalid metered usage quantity');
    if (reservation.actualQuantity > 0) assertQuantity(reservation.actualQuantity);
  }
  const { error } = await createServiceSupabaseClient().rpc('finalize_tenant_usages', {
    p_actor: actorUserId,
    p_reservation_ids: reservations.map(({ reservationId }) => reservationId),
    p_actual_quantities: reservations.map(({ actualQuantity }) => actualQuantity),
  });
  if (error) throw new Error(error.message);
}

export async function releaseTenantUsages(
  actorUserId: string,
  reservationIds: string[],
  reason: string,
): Promise<void> {
  if (reservationIds.length === 0) return;
  const { error } = await createServiceSupabaseClient().rpc('release_tenant_usages', {
    p_actor: actorUserId,
    p_reservation_ids: reservationIds,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export function resolveProviderCostCurrency(providerId: string): string {
  const providerKey = providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return (
    process.env[`PROVIDER_COST_CURRENCY_${providerKey}`] ??
    process.env.PROVIDER_COST_CURRENCY ??
    'USD'
  ).toUpperCase();
}

export async function runMeteredTenantUsage<T>(input: {
  source: string;
  billableUnit: BillableUnit;
  maxQuantity: number | (() => number | Promise<number>);
  providerId: string;
  modelId: string;
  execute: () => Promise<T>;
  measureActualQuantity: (result: T) => number | Promise<number>;
}): Promise<T> {
  const context = nextUsageOperationContext(input.source, input.billableUnit);
  if (!context) return input.execute();
  const maxQuantity =
    typeof input.maxQuantity === 'function' ? await input.maxQuantity() : input.maxQuantity;
  const reservation = await reserveTenantUsage({
    actorUserId: context.actorUserId,
    tenantId: context.tenantId,
    operationKey: context.operationKey,
    billableUnit: input.billableUnit,
    maxQuantity,
    providerId: input.providerId,
    modelId: input.modelId,
    providerCostCurrency: resolveProviderCostCurrency(input.providerId),
    idempotencyStable: context.idempotencyStable,
  });
  if (!reservation.enforcementEnabled) return input.execute();
  if (!reservation.reservationId) throw new Error('Missing usage reservation');

  let finalized = false;
  try {
    const result = await input.execute();
    const actualQuantity = await input.measureActualQuantity(result);
    if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) {
      throw new Error('Provider returned no measurable billable usage');
    }
    await settleTenantUsage(context.actorUserId, reservation.reservationId, actualQuantity);
    finalized = true;
    return result;
  } catch (error) {
    if (!finalized) {
      try {
        await releaseTenantUsage(
          context.actorUserId,
          reservation.reservationId,
          'Échec de l’opération fournisseur',
        );
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          'Provider operation failed and its credit reservation could not be released',
        );
      }
    }
    throw error;
  }
}

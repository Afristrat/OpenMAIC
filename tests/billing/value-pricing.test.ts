import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import {
  createTenantSellPrice,
  currencyAmountToMicrounits,
  debitAndValueTenantUsage,
  exchangeRateToNanos,
} from '@/lib/billing/value-pricing';

describe('value pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: 'version' }, error: null });
  });

  it('converts currency and FX decimals deterministically', () => {
    expect(currencyAmountToMicrounits('12.345678')).toBe(12_345_678);
    expect(currencyAmountToMicrounits('12')).toBe(12_000_000);
    expect(exchangeRateToNanos('10.123456789')).toBe(10_123_456_789);
    expect(() => currencyAmountToMicrounits('1.0000001')).toThrow('precision');
  });

  it('sends the explicit sell price without any cost-derived input', async () => {
    await createTenantSellPrice({
      actorUserId: 'actor',
      tenantId: 'tenant',
      billableUnit: 'llm_input_token',
      currency: 'MAD',
      priceAmount: '80',
      quantityBasis: '1000000',
      validFrom: '2026-09-01T00:00:00.000Z',
      commercialRationale: 'Valeur de la cohorte',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('create_tenant_sell_price', {
      p_actor: 'actor',
      p_org_id: 'tenant',
      p_billable_unit: 'llm_input_token',
      p_currency: 'MAD',
      p_price_microunits: 80_000_000,
      p_quantity_basis: '1000000',
      p_valid_from: '2026-09-01T00:00:00.000Z',
      p_commercial_rationale: 'Valeur de la cohorte',
    });
  });

  it('uses the atomic valued-debit RPC', async () => {
    mocks.single.mockResolvedValue({
      data: {
        ledger_id: 'ledger',
        balance_microunits: 900,
        credit_applied: true,
        valued_usage_id: 'valuation',
        revenue_microunits: 100,
        cost_microunits: 10,
        gross_margin_microunits: 90,
        margin_bps: 9000,
        target_margin_bps: 9500,
        below_target: true,
        valuation_applied: true,
      },
      error: null,
    });
    const result = await debitAndValueTenantUsage({
      actorUserId: 'actor',
      tenantId: 'tenant',
      creditMicrounits: 100,
      idempotencyKey: 'usage-0001',
      reason: 'Usage',
      billableUnit: 'operation',
      quantity: 1,
      referenceId: 'generation-1',
      sellCurrency: 'MAD',
      providerId: 'provider',
      modelId: 'model',
      providerCostCurrency: 'MAD',
    });
    expect(result).toMatchObject({ marginBps: 9000, targetMarginBps: 9500, belowTarget: true });
    expect(mocks.rpc).toHaveBeenCalledWith('debit_and_value_tenant_usage', expect.any(Object));
  });
});

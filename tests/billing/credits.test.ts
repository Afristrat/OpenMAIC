import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import {
  creditsToMicrounits,
  debitTenantCredits,
  microunitsToCredits,
  refundTenantCreditDebit,
} from '@/lib/billing/credits';

describe('tenant credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: { ledger_id: 'ledger-id', balance_microunits: '2500000', applied: true },
      error: null,
    });
  });

  it('uses integer microunits at the application boundary', () => {
    expect(creditsToMicrounits(1.234567)).toBe(1_234_567);
    expect(microunitsToCredits('1234567')).toBe(1.234567);
    expect(() => creditsToMicrounits(0)).toThrow('Invalid credit amount');
  });

  it('posts a debit with a negative delta and a stable usage reference', async () => {
    await debitTenantCredits({
      actorUserId: 'actor-id',
      tenantId: 'tenant-id',
      amountMicrounits: 125_000,
      idempotencyKey: 'usage-request-id',
      reason: 'Synthèse de la scène 4',
      billableUnit: 'tts_second',
      quantity: 12.5,
      referenceId: 'provider-request-id',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('post_tenant_credit_entry',
      expect.objectContaining({
        credit_entry_type: 'debit',
        credit_delta_microunits: -125_000,
        usage_unit: 'tts_second',
        usage_quantity: 12.5,
        usage_reference_id: 'provider-request-id',
      }),
    );
  });

  it('compensates a failed provider call by reversing the exact debit', async () => {
    await refundTenantCreditDebit({
      actorUserId: 'actor-id',
      tenantId: 'tenant-id',
      amountMicrounits: 125_000,
      idempotencyKey: 'refund-request-id',
      reason: 'Échec fournisseur',
      reversalOf: 'debit-ledger-id',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('post_tenant_credit_entry',
      expect.objectContaining({
        credit_entry_type: 'refund',
        credit_delta_microunits: 125_000,
        reversed_ledger_id: 'debit-ledger-id',
      }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  INSUFFICIENT_CREDITS_CODE,
  InsufficientCreditsError,
  containsInsufficientCredits,
} from '@/lib/billing/insufficient-credits';
import { formatGenerationError } from '@/lib/server/generation-error';
import { describeGenerationFailure } from '@/lib/generation/generation-tracking';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc }),
}));

describe('erreur de crédits insuffisants', () => {
  it('reconnaît le message Postgres brut, une cause imbriquée et une AggregateError', () => {
    expect(containsInsufficientCredits(new Error('INSUFFICIENT_TENANT_CREDITS'))).toBe(true);
    expect(
      containsInsufficientCredits(
        new Error('Failed after 3 attempts', { cause: new Error('INSUFFICIENT_TENANT_CREDITS') }),
      ),
    ).toBe(true);
    expect(
      containsInsufficientCredits(
        new AggregateError([new Error('x'), new InsufficientCreditsError()], ''),
      ),
    ).toBe(true);
    expect(containsInsufficientCredits(new Error('429 quota'))).toBe(false);
    expect(containsInsufficientCredits(undefined)).toBe(false);
  });

  it('survit à un message vide : le texte persisté dans le job porte le code stable', () => {
    const wrapped = new Error('', { cause: new Error('INSUFFICIENT_TENANT_CREDITS') });
    const persisted = formatGenerationError(wrapped);
    expect(persisted.startsWith(INSUFFICIENT_CREDITS_CODE)).toBe(true);
    expect(describeGenerationFailure(persisted)).toEqual({
      code: 'INSUFFICIENT_CREDITS',
      params: {},
    });
  });

  it("n'est pas confondue avec un quota fournisseur", () => {
    expect(describeGenerationFailure('INSUFFICIENT_TENANT_CREDITS')?.code).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(describeGenerationFailure('HTTP 429 quota exceeded')?.code).toBe('PROVIDER_QUOTA');
  });

  it('reserveTenantUsage lève une erreur typée portant le code stable', async () => {
    rpc.mockReturnValue({
      single: () =>
        Promise.resolve({ data: null, error: { message: 'INSUFFICIENT_TENANT_CREDITS' } }),
    });
    const { reserveTenantUsage } = await import('@/lib/billing/usage-metering');
    await expect(
      reserveTenantUsage({
        actorUserId: 'a',
        tenantId: 't',
        operationKey: 'operation-key-1',
        billableUnit: 'llm_input_token',
        maxQuantity: 10,
        providerId: 'p',
        modelId: 'm',
        providerCostCurrency: 'USD',
        idempotencyStable: true,
      }),
    ).rejects.toMatchObject({ code: INSUFFICIENT_CREDITS_CODE });
  });
});

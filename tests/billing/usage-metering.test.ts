import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { activateUsageMeteringContext } from '@/lib/billing/usage-context';
import { runMeteredTenantUsage } from '@/lib/billing/usage-metering';

function rpcResult(data: unknown) {
  return { single: vi.fn().mockResolvedValue({ data, error: null }) };
}

describe('provider usage reservation lifecycle (S6-025)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  function activate(): void {
    activateUsageMeteringContext(
      new Headers({ 'Idempotency-Key': 'metering-test-001' }),
      'actor',
      'tenant',
    );
  }

  it('reserves before execution and settles the measured quantity', async () => {
    activate();
    const events: string[] = [];
    mocks.rpc.mockImplementation((name: string) => {
      events.push(name);
      if (name === 'reserve_tenant_usage') {
        return rpcResult({
          enforcement_enabled: true,
          reservation_id: 'reservation',
          reserved_credit_microunits: 500000,
          applied: true,
        });
      }
      if (name === 'settle_tenant_usage') {
        return rpcResult({
          reservation_id: 'reservation',
          actual_credit_microunits: 250000,
          valued_usage_id: 'valuation',
          revenue_microunits: 1000000,
          cost_microunits: 100000,
          margin_bps: 9000,
          below_target: true,
          applied: true,
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const result = await runMeteredTenantUsage({
      source: 'image',
      billableUnit: 'image',
      maxQuantity: 1,
      providerId: 'image-provider',
      modelId: 'image-model',
      execute: async () => {
        events.push('provider');
        return { count: 1 };
      },
      measureActualQuantity: ({ count }) => count,
    });

    expect(result).toEqual({ count: 1 });
    expect(events).toEqual(['reserve_tenant_usage', 'provider', 'settle_tenant_usage']);
  });

  it('releases the full reservation when the provider fails', async () => {
    activate();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reserve_tenant_usage') {
        return rpcResult({
          enforcement_enabled: true,
          reservation_id: 'reservation',
          reserved_credit_microunits: 500000,
          applied: true,
        });
      }
      if (name === 'release_tenant_usage') {
        return rpcResult({ balance_microunits: 1000000, applied: true });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(
      runMeteredTenantUsage({
        source: 'tts',
        billableUnit: 'tts_second',
        maxQuantity: 30,
        providerId: 'tts-provider',
        modelId: 'tts-model',
        execute: async () => {
          throw new Error('provider failed');
        },
        measureActualQuantity: () => 1,
      }),
    ).rejects.toThrow('provider failed');
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_tenant_usage',
      'release_tenant_usage',
    ]);
  });

  it('does not call the provider when reservation is rejected', async () => {
    activate();
    const execute = vi.fn();
    mocks.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'INSUFFICIENT_TENANT_CREDITS' },
      }),
    });

    await expect(
      runMeteredTenantUsage({
        source: 'video',
        billableUnit: 'video_second',
        maxQuantity: 5,
        providerId: 'video-provider',
        modelId: 'video-model',
        execute,
        measureActualQuantity: () => 5,
      }),
    ).rejects.toThrow('INSUFFICIENT_TENANT_CREDITS');
    expect(execute).not.toHaveBeenCalled();
  });
});

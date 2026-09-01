import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  reserveTenantUsage: vi.fn(),
  finalizeTenantUsages: vi.fn(),
  releaseTenantUsages: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: mocks.streamText,
}));

vi.mock('@/lib/billing/usage-metering', () => ({
  reserveTenantUsage: mocks.reserveTenantUsage,
  finalizeTenantUsages: mocks.finalizeTenantUsages,
  releaseTenantUsages: mocks.releaseTenantUsages,
  resolveProviderCostCurrency: vi.fn(() => 'USD'),
}));

import { streamLLM } from '@/lib/ai/llm';
import { activateUsageMeteringContext } from '@/lib/billing/usage-context';

describe('streamed LLM usage metering (S6-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveTenantUsage
      .mockResolvedValueOnce({
        enforcementEnabled: true,
        reservationId: 'input-reservation',
      })
      .mockResolvedValueOnce({
        enforcementEnabled: true,
        reservationId: 'output-reservation',
      });
    mocks.finalizeTenantUsages.mockResolvedValue(undefined);
    mocks.releaseTenantUsages.mockResolvedValue(undefined);
    mocks.streamText.mockReturnValue({ stream: true });
  });

  function activate(): void {
    activateUsageMeteringContext(
      new Headers({ 'Idempotency-Key': 'stream-metering-001' }),
      'actor',
      'tenant',
    );
  }

  function params() {
    return {
      model: { provider: 'openai', modelId: 'gpt-test' },
      prompt: 'Bonjour',
      onFinish: vi.fn(),
      onError: vi.fn(),
      onAbort: vi.fn(),
    };
  }

  it('settles both reservations from the final streamed usage', async () => {
    activate();
    const input = params();
    await streamLLM(input as never, 'stream-test');
    const callbacks = mocks.streamText.mock.calls[0][0];

    await callbacks.onFinish({
      totalUsage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    });

    expect(mocks.finalizeTenantUsages).toHaveBeenCalledWith('actor', [
      { reservationId: 'input-reservation', actualQuantity: 12 },
      { reservationId: 'output-reservation', actualQuantity: 7 },
    ]);
    expect(mocks.releaseTenantUsages).not.toHaveBeenCalled();
    expect(input.onFinish).toHaveBeenCalledOnce();
  });

  it.each([
    ['onError', 'Échec du flux LLM'],
    ['onAbort', 'Flux LLM interrompu'],
  ] as const)('releases both reservations through %s', async (callback, reason) => {
    activate();
    const input = params();
    await streamLLM(input as never, 'stream-test');
    const callbacks = mocks.streamText.mock.calls[0][0];

    await callbacks[callback]({ error: new Error('stream stopped') });

    expect(mocks.releaseTenantUsages).toHaveBeenCalledWith(
      'actor',
      ['input-reservation', 'output-reservation'],
      reason,
    );
    expect(input[callback]).toHaveBeenCalledOnce();
  });
});

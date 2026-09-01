import { describe, expect, it } from 'vitest';
import {
  activateUsageMeteringContext,
  activateUsageMeteringJob,
  nextUsageOperationContext,
} from '@/lib/billing/usage-context';

describe('trusted usage metering context (S6-025)', () => {
  it('derives deterministic operation keys from a stable request id', () => {
    const headers = new Headers({ 'Idempotency-Key': 'request-stable-001' });
    activateUsageMeteringContext(headers, 'actor', 'tenant');
    const firstRun = [
      nextUsageOperationContext('generation', 'llm_input_token'),
      nextUsageOperationContext('generation', 'llm_output_token'),
    ];

    activateUsageMeteringContext(headers, 'actor', 'tenant');
    const replay = [
      nextUsageOperationContext('generation', 'llm_input_token'),
      nextUsageOperationContext('generation', 'llm_output_token'),
    ];

    expect(replay).toEqual(firstRun);
    expect(firstRun.every((context) => context?.idempotencyStable)).toBe(true);
    expect(firstRun[0]?.operationKey).not.toBe(firstRun[1]?.operationKey);
  });

  it('marks a missing or malformed client key as unstable', () => {
    activateUsageMeteringContext(new Headers(), 'actor', 'tenant');
    expect(nextUsageOperationContext('generation', 'operation')).toMatchObject({
      actorUserId: 'actor',
      tenantId: 'tenant',
      idempotencyStable: false,
    });
  });

  it('uses a durable job id as a stable retry boundary', () => {
    activateUsageMeteringJob('actor', 'tenant', 'classroom-job-123');
    const original = nextUsageOperationContext('tts', 'tts_second');
    activateUsageMeteringJob('actor', 'tenant', 'classroom-job-123');
    expect(nextUsageOperationContext('tts', 'tts_second')).toEqual(original);
  });
});

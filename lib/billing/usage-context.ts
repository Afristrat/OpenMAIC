import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import type { BillableUnit } from '@/lib/billing/credits';

type UsageRequestContext = {
  actorUserId: string;
  tenantId: string;
  requestKey: string;
  idempotencyStable: boolean;
  sequence: number;
};

export type UsageOperationContext = Omit<UsageRequestContext, 'sequence'> & {
  operationKey: string;
};

const usageContext = new AsyncLocalStorage<UsageRequestContext>();
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/;

export function activateUsageMeteringContext(
  headers: Headers,
  actorUserId: string,
  tenantId: string,
): void {
  const suppliedKey = headers.get('idempotency-key')?.trim();
  const idempotencyStable = suppliedKey !== undefined && IDEMPOTENCY_KEY.test(suppliedKey);
  usageContext.enterWith({
    actorUserId,
    tenantId,
    requestKey: idempotencyStable ? suppliedKey : `request-${randomUUID()}`,
    idempotencyStable,
    sequence: 0,
  });
}

export function activateUsageMeteringJob(
  actorUserId: string,
  tenantId: string,
  jobKey: string,
): void {
  if (!IDEMPOTENCY_KEY.test(jobKey)) throw new Error('Invalid usage-metering job key');
  usageContext.enterWith({
    actorUserId,
    tenantId,
    requestKey: jobKey,
    idempotencyStable: true,
    sequence: 0,
  });
}

export function nextUsageOperationContext(
  source: string,
  billableUnit: BillableUnit,
): UsageOperationContext | null {
  const current = usageContext.getStore();
  if (!current) return null;
  const sequence = current.sequence++;
  const operationKey = `usage:${createHash('sha256')
    .update(`${current.requestKey}|${source}|${sequence}|${billableUnit}`)
    .digest('hex')}`;
  return {
    actorUserId: current.actorUserId,
    tenantId: current.tenantId,
    requestKey: current.requestKey,
    idempotencyStable: current.idempotencyStable,
    operationKey,
  };
}

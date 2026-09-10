import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ scheduler: vi.fn() }));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function (this: { upsertJobScheduler: typeof mocks.scheduler }) {
    this.upsertJobScheduler = mocks.scheduler;
  }),
}));
it('reuses the xAPI queue with one stable durable minute scheduler', async () => {
  const { configureXapiDeliveryScheduler } = await import('@/lib/jobs/queue');
  await configureXapiDeliveryScheduler();
  await configureXapiDeliveryScheduler();
  expect(mocks.scheduler).toHaveBeenCalledTimes(2);
  expect(mocks.scheduler).toHaveBeenLastCalledWith(
    'xapi-outbox-minute',
    { every: 60000 },
    expect.objectContaining({ name: 'scan', data: {} }),
  );
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Queue: vi.fn(function MockQueue(this: { name: string }, name: string) {
    this.name = name;
  }),
}));

vi.mock('bullmq', () => ({ Queue: mocks.Queue }));

describe('BullMQ queue lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.Queue.mockClear();
  });

  it('opens no Redis-backed queue while Next.js imports route modules at build time', async () => {
    await import('@/lib/jobs/queue');
    expect(mocks.Queue).not.toHaveBeenCalled();
  });

  it('creates each runtime queue once on first use', async () => {
    const { getJobQueues } = await import('@/lib/jobs/queue');
    const first = getJobQueues();
    const second = getJobQueues();

    expect(second).toBe(first);
    expect(mocks.Queue).toHaveBeenCalledTimes(7);
    expect(mocks.Queue.mock.calls.map(([name]) => name)).toEqual([
      'classroom-generation',
      'video-capsule',
      'video-generation',
      'export-job',
      'transmission',
      'transmission-visual-watermark',
      'webhook-delivery',
    ]);
  });
});

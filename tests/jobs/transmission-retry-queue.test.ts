import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  remove: vi.fn(),
  getState: vi.fn(),
  Queue: vi.fn(function MockQueue(this: Record<string, unknown>) {
    this.add = mocks.add;
    this.getJob = mocks.getJob;
  }),
}));

vi.mock('bullmq', () => ({ Queue: mocks.Queue }));

describe('transmission retry queues', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.add.mockResolvedValue({ id: 'new-job' });
  });

  it.each([
    ['transmission', 'transmission-tx_1'],
    ['transmission visual watermark', 'transmission-visual-watermark-tx_1'],
  ])('replaces a failed %s job with the same deterministic id', async (kind, jobId) => {
    mocks.getState.mockResolvedValue('failed');
    mocks.getJob.mockResolvedValue({ getState: mocks.getState, remove: mocks.remove });

    const queue = await import('@/lib/jobs/queue');
    if (kind === 'transmission') await queue.enqueueTransmission({ transmissionId: 'tx_1' });
    else await queue.enqueueTransmissionVisualWatermark({ transmissionId: 'tx_1' });

    expect(mocks.getJob).toHaveBeenCalledWith(jobId);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.add).toHaveBeenCalledWith(
      expect.any(String),
      { transmissionId: 'tx_1' },
      expect.objectContaining({ jobId }),
    );
  });

  it('does not disturb an active transmission job', async () => {
    mocks.getState.mockResolvedValue('active');
    mocks.getJob.mockResolvedValue({ getState: mocks.getState, remove: mocks.remove });

    const { enqueueTransmission } = await import('@/lib/jobs/queue');
    await enqueueTransmission({ transmissionId: 'tx_1' });

    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

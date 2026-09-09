import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getFailed: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  in: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock('@/lib/jobs/queue', () => ({
  getJobQueues: () => ({ videoGeneration: { getFailed: mocks.getFailed } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: () => mocks }));
import { reconcileFailedManagedVideos } from '@/lib/server/managed-video-reconciliation';
const id = '00000000-0036-4000-8000-000000000192';
const failure = (state = 'failed', data: unknown = { videoGenerationJobId: id }) => ({
  id: '37',
  name: 'generate',
  data,
  getState: vi.fn().mockResolvedValue(state),
});
beforeEach(() => {
  vi.resetAllMocks();
  for (const method of ['from', 'update', 'in', 'eq', 'select'] as const)
    mocks[method].mockReturnValue(mocks);
  mocks.abortSignal.mockResolvedValue({ data: [{ id }], error: null });
  mocks.getFailed.mockResolvedValue([failure()]);
});
it('uses the real legacy payload, deduplicates failures and only transitions generating rows', async () => {
  mocks.getFailed.mockResolvedValue([failure(), failure()]);
  await reconcileFailedManagedVideos();
  expect(mocks.getFailed).toHaveBeenCalledWith(0, 499);
  expect(mocks.in).toHaveBeenCalledWith('id', [id]);
  expect(mocks.eq).toHaveBeenCalledWith('status', 'generating');
  expect(mocks.update).toHaveBeenCalledWith({
    status: 'error',
    error: 'Video generation interrupted; automatic replay refused',
  });
});
it('does not infer failures from missing, active, waiting, completed or invalid jobs', async () => {
  mocks.getFailed.mockResolvedValue([
    ...['unknown', 'active', 'waiting', 'completed', 'delayed'].map((state) => failure(state)),
    failure('failed', { videoGenerationJobId: 'invalid' }),
    { ...failure(), name: 'other' },
  ]);
  await reconcileFailedManagedVideos();
  expect(mocks.from).not.toHaveBeenCalled();
});
it('leaves the database alone when Redis fails, and retries on the next invocation', async () => {
  mocks.getFailed.mockRejectedValueOnce(new Error('Redis unavailable'));
  await expect(reconcileFailedManagedVideos()).rejects.toThrow('Redis unavailable');
  expect(mocks.from).not.toHaveBeenCalled();
  await reconcileFailedManagedVideos();
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
it('does not acknowledge a failed database write or an unknown response', async () => {
  for (const result of [
    { data: [], error: {} },
    { data: null, error: null },
  ]) {
    mocks.abortSignal.mockResolvedValue(result);
    await expect(reconcileFailedManagedVideos()).rejects.toThrow('reconciliation unavailable');
  }
});
it('accepts zero updated rows when completion or account deletion won the race', async () => {
  mocks.abortSignal.mockResolvedValue({ data: [], error: null });
  await expect(reconcileFailedManagedVideos()).resolves.toBeUndefined();
});

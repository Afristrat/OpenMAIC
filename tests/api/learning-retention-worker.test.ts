import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn(), error: vi.fn() }));
const videoCleanup = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const reconcileVideos = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/server/managed-video-reconciliation', () => ({
  reconcileFailedManagedVideos: reconcileVideos,
}));
vi.mock('@/lib/server/managed-video-cleanup', () => ({ purgeOrphanedManagedVideos: videoCleanup }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: mocks.error }) }));
import {
  purgeDetachedPersonalAgents,
  purgeExpiredLearningObservations,
  startLearningRetentionWorker,
} from '@/lib/telemetry/learning-retention-worker';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('learning retention worker', () => {
  it('uses the fixed-policy service RPC and rejects failures or invalid acknowledgements', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: 2, error: null });
    expect(await purgeExpiredLearningObservations()).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith('purge_expired_learning_observations');
    expect(await purgeDetachedPersonalAgents()).toBe(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith('purge_detached_personal_agents');
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    for (const result of [
      { data: null, error: null },
      { data: 1001, error: null },
      { data: -1, error: null },
      { data: 0.5, error: null },
      { data: 0, error: {} },
    ]) {
      mocks.abortSignal.mockResolvedValue(result);
      await expect(purgeExpiredLearningObservations()).rejects.toThrow('retention');
      await expect(purgeDetachedPersonalAgents()).rejects.toThrow('retention');
    }
  });
  it('drains bounded batches at startup, retries next hour and stops cleanly', async () => {
    vi.useFakeTimers();
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: 1000, error: null });
    const stop = startLearningRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(20);
    expect(videoCleanup).toHaveBeenCalledTimes(1);
    expect(reconcileVideos).toHaveBeenCalledTimes(1);
    mocks.abortSignal.mockRejectedValue(new Error('database offline'));
    await vi.advanceTimersByTimeAsync(3600000);
    expect(mocks.rpc).toHaveBeenCalledTimes(22);
    expect(mocks.error).toHaveBeenCalledTimes(2);
    expect(videoCleanup).toHaveBeenCalledTimes(2);
    expect(reconcileVideos).toHaveBeenCalledTimes(2);
    await stop();
    await vi.advanceTimersByTimeAsync(3600000);
    expect(mocks.rpc).toHaveBeenCalledTimes(22);
  });
  it('purges personal agents even when learning retention fails', async () => {
    vi.useFakeTimers();
    mocks.rpc.mockImplementation((procedure: string) => ({
      abortSignal: () =>
        procedure === 'purge_expired_learning_observations'
          ? Promise.reject(new Error('unavailable'))
          : Promise.resolve({ data: 0, error: null }),
    }));
    const stop = startLearningRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith('purge_detached_personal_agents');
    expect(mocks.error).toHaveBeenCalledTimes(1);
    await stop();
  });
  it('continues retention when Redis reconciliation is unavailable', async () => {
    vi.useFakeTimers();
    reconcileVideos.mockRejectedValueOnce(new Error('Redis unavailable'));
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: 0, error: null });
    const stop = startLearningRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(videoCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledTimes(1);
    await stop();
  });
});

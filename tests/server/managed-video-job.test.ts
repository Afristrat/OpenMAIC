import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  generate: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  authorize: vi.fn(),
  loseCompletion: false,
  unavailableAfterCompletion: false,
  unavailable: false,
}));
vi.mock('@/lib/server/course-generation-access', () => ({
  assertCourseGenerationAccess: mocks.authorize,
}));
vi.mock('@/lib/billing/usage-context', () => ({ activateUsageMeteringJob: vi.fn() }));
vi.mock('@/lib/server/metered-media-providers', () => ({ generateMeteredVideo: mocks.generate }));
vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: () => true,
  resolveVideoApiKey: () => 'test-key',
  resolveVideoBaseUrl: () => undefined,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: () => {
      let patch: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        abortSignal: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        maybeSingle: async () => {
          if (mocks.unavailable) return { error: { message: 'unavailable' } };
          if (!mocks.row || !filters.every(([key, value]) => mocks.row?.[key] === value))
            return { data: null };
          if (patch) Object.assign(mocks.row, patch);
          if (patch?.status === 'done' && mocks.loseCompletion) {
            mocks.unavailable = mocks.unavailableAfterCompletion;
            return { error: { message: 'ack lost' } };
          }
          return { data: { ...mocks.row } };
        },
      };
      return query;
    },
  }),
}));
import { runManagedVideoJob } from '@/lib/server/managed-video-job';

const id = '00000000-0036-4000-8000-000000000181';
const actor = '00000000-0036-4000-8000-000000000182';
const path = expect.stringMatching(
  new RegExp(`^generated-video/${actor}/${id}-[a-f0-9-]{36}\\.mp4$`),
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = {
    id,
    owner_id: actor,
    org_id: 'tenant',
    status: 'queued',
    provider_id: 'openai',
    request: {},
  };
  mocks.loseCompletion = false;
  mocks.unavailableAfterCompletion = false;
  mocks.unavailable = false;
  mocks.generate.mockReset().mockResolvedValue({
    url: 'data:video/mp4;base64,dmlkZW8=',
    width: 16,
    height: 9,
    duration: 1,
  });
  mocks.authorize.mockReset().mockResolvedValue(undefined);
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.remove.mockReset().mockResolvedValue({ error: null });
});
it('claims once, stores completion and skips a replay', async () => {
  expect(await runManagedVideoJob(id)).toBe(true);
  expect(await runManagedVideoJob(id)).toBe(false);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.row).toMatchObject({ status: 'done', storage_path: path });
});
it('lets only one concurrent runner call the provider', async () => {
  expect(await Promise.all([runManagedVideoJob(id), runManagedVideoJob(id)])).toEqual([
    true,
    false,
  ]);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it('does not restart an ambiguous previously started job', async () => {
  mocks.row!.status = 'generating';
  await expect(runManagedVideoJob(id)).rejects.toThrow('automatic provider replay refused');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('does not upload after deletion during the provider call', async () => {
  mocks.generate.mockImplementationOnce(async () => {
    mocks.row = null;
    return { url: 'data:video/mp4;base64,dmlkZW8=' };
  });
  await expect(runManagedVideoJob(id)).rejects.toThrow('no longer active');
  expect(mocks.upload).not.toHaveBeenCalled();
});
it('cleans only this file when deletion occurs during upload', async () => {
  mocks.upload.mockImplementationOnce(async () => {
    mocks.row = null;
    return { error: null };
  });
  await expect(runManagedVideoJob(id)).rejects.toThrow('no longer active');
  expect(mocks.remove).toHaveBeenCalledWith([path]);
});
it('keeps a committed file when its completion response is lost', async () => {
  mocks.loseCompletion = true;
  expect(await runManagedVideoJob(id)).toBe(true);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('retains a file and reports uncertainty when completion cannot be checked', async () => {
  mocks.loseCompletion = true;
  mocks.unavailableAfterCompletion = true;
  await expect(runManagedVideoJob(id)).rejects.toThrow('outcome unresolved');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('fails closed and records a terminal error when authorization has been revoked', async () => {
  mocks.authorize.mockRejectedValue(new Error('revoked'));
  await expect(runManagedVideoJob(id)).rejects.toThrow('revoked');
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.row?.status).toBe('error');
});

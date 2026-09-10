import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
  records: vi.fn(),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    rpc: mocks.rpc,
    storage: { from: mocks.from },
  }),
}));
import {
  purgeOrphanedManagedVideos,
  purgeOrphanedCourseImports,
  purgeOrphanedSessionAudio,
} from '@/lib/server/managed-video-cleanup';
const candidate = {
  object_id: '00000000-0036-4000-8000-000000000193',
  object_name:
    'generated-video/00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000193.mp4',
};
it('uses the replay policy and rejects paths outside its canonical session scope', async () => {
  const object_name =
    '00000000-0036-4000-8000-000000000191/00000000-0036-4000-8000-000000000192/00000000-0036-4000-8000-000000000193.wav';
  mocks.abortSignal.mockResolvedValue({ data: [{ ...candidate, object_name }] });
  expect(await purgeOrphanedSessionAudio()).toBe(1);
  expect(mocks.rpc).toHaveBeenCalledWith('list_orphaned_session_audio');
  expect(mocks.from).toHaveBeenCalledWith('session-audio');
  expect(mocks.remove).toHaveBeenCalledWith([object_name]);
  mocks.abortSignal.mockResolvedValue({ data: [candidate] });
  await expect(purgeOrphanedSessionAudio()).rejects.toThrow('selection');
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.mockResolvedValue({ data: 0, error: null });
  mocks.rpc.mockImplementation((procedure) => ({
    abortSignal:
      procedure === 'purge_detached_course_import_records' ? mocks.records : mocks.abortSignal,
  }));
  mocks.abortSignal.mockResolvedValue({ data: [candidate] });
  mocks.from.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockReset().mockResolvedValue({ error: null });
});
it('removes only validated names in the fixed bucket via Storage', async () => {
  expect(await purgeOrphanedManagedVideos()).toBe(1);
  expect(mocks.rpc).toHaveBeenCalledWith('list_orphaned_managed_videos');
  expect(mocks.from).toHaveBeenCalledWith('exports');
  expect(mocks.remove).toHaveBeenCalledWith([candidate.object_name]);
});
it.each([
  null,
  [{ ...candidate, object_name: 'other/asset.mp4' }],
  [candidate, candidate],
  Array.from({ length: 101 }, () => candidate),
])('refuses invalid or oversized selections before deletion', async (data) => {
  mocks.abortSignal.mockResolvedValue({ data });
  await expect(purgeOrphanedManagedVideos()).rejects.toThrow('selection');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('does not acknowledge a failed removal and retries the metadata next call', async () => {
  mocks.remove.mockResolvedValueOnce({ error: { message: 'unavailable' } });
  await expect(purgeOrphanedManagedVideos()).rejects.toThrow('storage removal failed');
  expect(await purgeOrphanedManagedVideos()).toBe(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it('does not call Storage for an empty or unavailable selection', async () => {
  mocks.abortSignal.mockResolvedValueOnce({ data: [] });
  expect(await purgeOrphanedManagedVideos()).toBe(0);
  mocks.abortSignal.mockResolvedValueOnce({ data: [candidate], error: {} });
  await expect(purgeOrphanedManagedVideos()).rejects.toThrow('selection');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('uses the import policy and fixed private bucket without mixing video paths', async () => {
  const object_name =
    '00000000-0036-4000-8000-000000000191/course-imports/00000000-0036-4000-8000-000000000193.pdf';
  mocks.abortSignal.mockResolvedValue({ data: [{ ...candidate, object_name }] });
  expect(await purgeOrphanedCourseImports()).toBe(1);
  expect(mocks.rpc).toHaveBeenCalledWith('list_orphaned_course_import_files');
  expect(mocks.from).toHaveBeenCalledWith('classroom-media');
  expect(mocks.remove).toHaveBeenCalledWith([object_name]);
  mocks.abortSignal.mockResolvedValue({ data: [candidate] });
  await expect(purgeOrphanedCourseImports()).rejects.toThrow('selection');
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it('does not discard import records when Storage fails and retries failures', async () => {
  const object_name =
    '00000000-0036-4000-8000-000000000191/course-imports/00000000-0036-4000-8000-000000000193.pdf';
  mocks.abortSignal.mockResolvedValue({ data: [{ ...candidate, object_name }] });
  mocks.remove.mockResolvedValueOnce({ error: {} });
  await expect(purgeOrphanedCourseImports()).rejects.toThrow('storage removal');
  expect(mocks.records).not.toHaveBeenCalled();
  mocks.records.mockResolvedValueOnce({ data: null, error: {} });
  await expect(purgeOrphanedCourseImports()).rejects.toThrow('record removal');
  expect(await purgeOrphanedCourseImports()).toBe(1);
});

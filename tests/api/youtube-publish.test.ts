import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const JOB = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  job: vi.fn(),
  channel: vi.fn(),
  existing: vi.fn(),
  insert: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/server/youtube', () => ({ readYoutubeChannel: mocks.channel }));
vi.mock('@/lib/jobs/queue', () => ({ enqueueYoutubeUpload: mocks.enqueue }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.job }) }),
    }),
  }),
}));
vi.mock('@/lib/supabase/service', () => {
  // Chaîne de lecture des envois en cours : select.eq.eq.eq.in puis is/eq, limit, maybeSingle.
  const reader: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'in', 'is', 'limit']) reader[name] = () => reader;
  reader.maybeSingle = mocks.existing;
  return {
    createServiceSupabaseClient: () => ({
      from: () => ({
        ...reader,
        insert: (row: unknown) => ({
          select: () => ({ single: () => mocks.insert(row) }),
        }),
      }),
    }),
  };
});

import { POST } from '@/app/api/youtube/publish/route';

function post(body: unknown): NextRequest {
  return new NextRequest('https://qalem.ma/api/youtube/publish', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/youtube/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'user-1', email: 'a@example.test' } });
    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'mp4', status: 'done', scene_count: 3, owner_id: 'user-1' },
    });
    mocks.channel.mockResolvedValue({ channelId: 'UC1', channelTitle: 'Ma chaîne' });
    mocks.existing.mockResolvedValue({ data: null });
    mocks.insert.mockResolvedValue({ data: { id: 'up-1', status: 'queued' }, error: null });
  });

  it('refuse une personne non connectée avant toute lecture', async () => {
    mocks.requireAuth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }))).status).toBe(401);
    expect(mocks.job).not.toHaveBeenCalled();
  });

  it('refuse un export qui n’est pas à la personne : 404, sans fuite', async () => {
    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'mp4', status: 'done', scene_count: 3, owner_id: 'autre' },
    });
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }))).status).toBe(404);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('refuse un export pas prêt, un format non vidéo, un chapitre hors bornes', async () => {
    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'mp4', status: 'generating', scene_count: 3, owner_id: 'user-1' },
    });
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }))).status).toBe(409);

    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'scorm12', status: 'done', scene_count: 3, owner_id: 'user-1' },
    });
    expect((await POST(post({ exportJobId: JOB, title: 'T' }))).status).toBe(400);

    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'mp4', status: 'done', scene_count: 3, owner_id: 'user-1' },
    });
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 3 }))).status).toBe(400);
    expect((await POST(post({ exportJobId: JOB, title: 'T' }))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('refuse une vidéo unique désignée par un chapitre', async () => {
    mocks.job.mockResolvedValue({
      data: { id: JOB, format: 'video', status: 'done', scene_count: 3, owner_id: 'user-1' },
    });
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }))).status).toBe(400);
  });

  it('exige une chaîne connectée', async () => {
    mocks.channel.mockResolvedValue(null);
    expect((await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }))).status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('met en file un chapitre, toujours non répertorié, et répond 202', async () => {
    const res = await POST(post({ exportJobId: JOB, title: ' Chapitre 1 ', chapterIndex: 1 }));
    expect(res.status).toBe(202);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        export_job_id: JOB,
        chapter_index: 1,
        title: 'Chapitre 1',
        privacy_status: 'unlisted',
      }),
    );
    expect(mocks.enqueue).toHaveBeenCalledWith({ uploadId: 'up-1' });
  });

  it('ne double pas un envoi déjà en file pour le même contenu', async () => {
    mocks.existing.mockResolvedValue({ data: { id: 'up-0', status: 'uploading' } });
    const res = await POST(post({ exportJobId: JOB, title: 'T', chapterIndex: 0 }));
    expect(res.status).toBe(202);
    expect((await res.json()).reused).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});

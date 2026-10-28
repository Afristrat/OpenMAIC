import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ownerFilter: vi.fn(),
  rows: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgExporter: vi.fn(),
  isSuperAdminEmail: vi.fn(),
}));
vi.mock('@/lib/server/classroom-storage', () => ({ readClassroomOwnership: vi.fn() }));
vi.mock('@/lib/jobs/queue', () => ({ enqueueExportJob: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          mocks.ownerFilter(column, value);
          return chain;
        },
        order: () => chain,
        limit: async () => mocks.rows(),
      };
      return chain;
    },
  }),
}));

import { GET } from '@/app/api/export-jobs/route';

const request = () => new NextRequest('https://qalem.ma/api/export-jobs');

describe('GET /api/export-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'user-1', email: 'a@example.test' } });
  });

  it('refuses an unauthenticated request before reading any export', async () => {
    mocks.requireAuth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it('lists only the exports of the signed-in person, without any storage path', async () => {
    mocks.rows.mockReturnValue({
      data: [
        {
          id: 'job-1',
          stage_id: 'stage-1',
          format: 'mp4',
          status: 'done',
          created_at: '2026-10-28T10:00:00Z',
          storage_path: 'secret/path.mp4',
          stages: { name: 'Vente B2B' },
        },
        {
          id: 'job-2',
          stage_id: 'stage-2',
          format: 'scorm12',
          status: 'queued',
          created_at: '2026-10-27T10:00:00Z',
          stages: [{ name: '  ' }],
        },
      ],
      error: null,
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.ownerFilter).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(body.exports).toEqual([
      {
        id: 'job-1',
        stageId: 'stage-1',
        courseName: 'Vente B2B',
        format: 'mp4',
        status: 'done',
        createdAt: '2026-10-28T10:00:00Z',
      },
      {
        id: 'job-2',
        stageId: 'stage-2',
        courseName: null,
        format: 'scorm12',
        status: 'queued',
        createdAt: '2026-10-27T10:00:00Z',
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('secret/path');
  });

  it('answers 500 when the read fails', async () => {
    mocks.rows.mockReturnValue({ data: null, error: { message: 'boom' } });
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});

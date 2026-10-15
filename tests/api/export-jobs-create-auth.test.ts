import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireExporter: vi.fn(),
  isSuperAdminEmail: vi.fn(),
  readOwnership: vi.fn(),
  enqueue: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgExporter: mocks.requireExporter,
  isSuperAdminEmail: mocks.isSuperAdminEmail,
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroomOwnership: mocks.readOwnership,
}));
vi.mock('@/lib/jobs/queue', () => ({ enqueueExportJob: mocks.enqueue }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'scenes') {
        const rows = { data: [], error: null };
        const chain = { select: () => chain, eq: () => chain, order: async () => rows };
        return chain;
      }
      return {
        insert: (row: unknown) => {
          mocks.insert(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'job-1', status: 'queued' }, error: null }),
            }),
          };
        },
      };
    },
  }),
}));

import { POST } from '@/app/api/export-jobs/route';

const STAGE = 'stage-1';
const ORG = '00000000-0000-4000-8000-000000000001';
const OWNER = 'owner-1';

function post(format = 'scorm12'): NextRequest {
  return new NextRequest('https://qalem.ma/api/export-jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stageId: STAGE, format }),
  });
}

const forbidden = () => ({ response: NextResponse.json({ error: 'nope' }, { status: 403 }) });

describe('POST /api/export-jobs access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'actor', email: 'actor@example.test' } });
    mocks.isSuperAdminEmail.mockReturnValue(false);
    mocks.readOwnership.mockResolvedValue({ ownerId: OWNER, orgId: ORG });
    mocks.requireExporter.mockResolvedValue({ user: { id: 'actor', email: 'actor@example.test' } });
  });

  it('refuses an unauthenticated request before touching any data', async () => {
    mocks.requireAuth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(mocks.readOwnership).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown stage without creating a job', async () => {
    mocks.readOwnership.mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each(['scorm12', 'scorm2004', 'cmi5', 'mp4'])(
    'refuses a %s export to a member who may not export (learner)',
    async (format) => {
      mocks.requireExporter.mockResolvedValue(forbidden());
      const res = await POST(post(format));
      expect(res.status).toBe(403);
      expect(mocks.requireExporter).toHaveBeenCalledWith(expect.anything(), ORG);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    },
  );

  it.each(['scorm12', 'scorm2004', 'cmi5', 'mp4'])(
    'lets an organization role above learner create a %s export job owned by the actor',
    async (format) => {
      const res = await POST(post(format));
      expect(res.status).toBe(202);
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ stage_id: STAGE, owner_id: 'actor', format, status: 'queued' }),
      );
      expect(mocks.enqueue).toHaveBeenCalledWith({ exportJobId: 'job-1' });
    },
  );

  describe('stage without organization', () => {
    beforeEach(() => {
      mocks.readOwnership.mockResolvedValue({ ownerId: OWNER, orgId: null });
    });

    it('lets the owner export', async () => {
      mocks.requireAuth.mockResolvedValue({ user: { id: OWNER, email: 'o@example.test' } });
      expect((await POST(post())).status).toBe(202);
      expect(mocks.requireExporter).not.toHaveBeenCalled();
    });

    it('lets the configured super admin export', async () => {
      mocks.isSuperAdminEmail.mockReturnValue(true);
      expect((await POST(post())).status).toBe(202);
    });

    it('refuses anyone else', async () => {
      const res = await POST(post());
      expect(res.status).toBe(403);
      expect(mocks.enqueue).not.toHaveBeenCalled();
    });
  });

  it('keeps rejecting an unsupported format and a missing stageId with 400', async () => {
    expect((await POST(post('pdf'))).status).toBe(400);
    const res = await POST(
      new NextRequest('https://qalem.ma/api/export-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'scorm12' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

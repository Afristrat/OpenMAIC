import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const COURSE_ID = '00000000-0000-4000-8000-000000000091';
const ORG_ID = '00000000-0000-4000-8000-000000000092';
const OWNER_ID = '00000000-0000-4000-8000-000000000093';

type Result = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isSuperAdmin: vi.fn(),
  guard: vi.fn(),
  course: { data: null, error: null } as Result,
  reads: 0,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  isSuperAdminEmail: mocks.isSuperAdmin,
  requireSuperAdminOrOrgEditor: mocks.guard,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from() {
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq']) builder[op] = () => builder;
      builder.maybeSingle = () => {
        mocks.reads += 1;
        return Promise.resolve(mocks.course);
      };
      return builder;
    },
  }),
}));

import { requireCourseEditor } from '@/lib/server/course-editor-access';

const request = () => new NextRequest('https://qalem.ma/api/courses/x/competencies');
const real = {
  data: { id: COURSE_ID, org_id: ORG_ID, owner_id: OWNER_ID, stage_id: 'stage1' },
  error: null,
};

describe('requireCourseEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reads = 0;
    mocks.course = real;
    mocks.requireAuth.mockResolvedValue({ user: { id: 'u', email: 'editor@qalem.ma' } });
    mocks.isSuperAdmin.mockReturnValue(false);
    mocks.guard.mockResolvedValue({ user: { id: 'u', email: 'editor@qalem.ma' } });
  });

  it('answers 401 without a session, whatever the id, before reading anything', async () => {
    mocks.requireAuth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });

    for (const id of [COURSE_ID, '00000000-0000-0000-0000-000000000000', 'abc']) {
      const result = await requireCourseEditor(request(), id);
      expect(result.response?.status).toBe(401);
    }
    expect(mocks.reads).toBe(0);
  });

  it('refuses an id that is not a UUID with a 400, without reading the database', async () => {
    const result = await requireCourseEditor(request(), 'abc');

    expect(result.response?.status).toBe(400);
    expect(mocks.reads).toBe(0);
  });

  it('gives an ordinary editor the same 403 for an unknown course and for a real one they cannot edit', async () => {
    mocks.course = { data: null, error: null };
    const unknown = await requireCourseEditor(request(), COURSE_ID);

    mocks.course = real;
    mocks.guard.mockResolvedValue({
      response: NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 }),
    });
    const forbidden = await requireCourseEditor(request(), COURSE_ID);

    expect(unknown.response?.status).toBe(403);
    expect(forbidden.response?.status).toBe(403);
  });

  it('shows a 404 for an unknown course to the super administrator only', async () => {
    mocks.course = { data: null, error: null };
    mocks.isSuperAdmin.mockReturnValue(true);

    expect((await requireCourseEditor(request(), COURSE_ID)).response?.status).toBe(404);
  });

  it('hands back the course and the user once the organization role allows editing', async () => {
    const result = await requireCourseEditor(request(), COURSE_ID);

    expect(result.response).toBeUndefined();
    expect(result).toMatchObject({ course: { id: COURSE_ID, org_id: ORG_ID }, user: { id: 'u' } });
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), ORG_ID, OWNER_ID, 'stage1');
  });
});

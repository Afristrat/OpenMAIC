import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000016';
const COURSE_ID = '00000000-0000-4000-8000-000000000017';
const STAGE_ID = 'stageAbc123';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  readSelect: vi.fn(),
  readFirstEq: vi.fn(),
  readSecondEq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateFirstEq: vi.fn(),
  updateSecondEq: vi.fn(),
  publishToLibrary: vi.fn(),
  shareRepository: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ session: 'admin' }),
}));
vi.mock('@/lib/org/supabase-share-repository', () => ({
  supabaseShareRepository: mocks.shareRepository,
}));
vi.mock('@/lib/org/publish-to-library', () => ({
  publishStagesToLibrary: mocks.publishToLibrary,
}));

import { PATCH } from '@/app/api/courses/[courseId]/publication/route';

function request(body: unknown): NextRequest {
  return new NextRequest(`https://qalem.ma/api/courses/${COURSE_ID}/publication`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ courseId: COURSE_ID }) };
}

describe('PATCH /api/courses/[courseId]/publication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-id', email: 'admin@qalem.ma' } });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: COURSE_ID, status: 'ready', stage_id: STAGE_ID },
      error: null,
    });
    mocks.readSecondEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.readFirstEq.mockReturnValue({ eq: mocks.readSecondEq });
    mocks.readSelect.mockReturnValue({ eq: mocks.readFirstEq });
    mocks.updateSecondEq.mockResolvedValue({ error: null });
    mocks.updateFirstEq.mockReturnValue({ eq: mocks.updateSecondEq });
    mocks.update.mockReturnValue({ eq: mocks.updateFirstEq });
    mocks.shareRepository.mockReturnValue({ repository: true });
    mocks.publishToLibrary.mockResolvedValue([{ stageId: STAGE_ID, outcome: 'published' }]);
    mocks.from.mockReturnValue({ select: mocks.readSelect, update: mocks.update });
  });

  it('rejects the mutation before querying data when the caller is not an organization admin', async () => {
    mocks.requireAdmin.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await PATCH(request({ orgId: ORG_ID, visible: true }), params());

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses to publish a course that is not ready', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: COURSE_ID, status: 'draft' }, error: null });

    const response = await PATCH(request({ orgId: ORG_ID, visible: true }), params());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates publication only after reading the course in the requested organization', async () => {
    const response = await PATCH(request({ orgId: ORG_ID, visible: true }), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.readFirstEq).toHaveBeenCalledWith('id', COURSE_ID);
    expect(mocks.readSecondEq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(mocks.update).toHaveBeenCalledWith({ catalog_visible: true });
    expect(mocks.updateFirstEq).toHaveBeenCalledWith('id', COURSE_ID);
    expect(mocks.updateSecondEq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(body).toMatchObject({ success: true, courseId: COURSE_ID, catalogVisible: true });
  });

  it('publishes the stage to the organization library with the admin session before showing it in the catalog', async () => {
    const response = await PATCH(request({ orgId: ORG_ID, visible: true }), params());

    expect(response.status).toBe(200);
    expect(mocks.shareRepository).toHaveBeenCalledWith({ session: 'admin' });
    expect(mocks.publishToLibrary).toHaveBeenCalledWith({ repository: true }, ORG_ID, [STAGE_ID]);
    expect(mocks.update).toHaveBeenCalledWith({ catalog_visible: true });
  });

  it('keeps the catalog untouched when the library publication is denied or fails', async () => {
    mocks.publishToLibrary.mockResolvedValue([{ stageId: STAGE_ID, outcome: 'denied' }]);
    expect((await PATCH(request({ orgId: ORG_ID, visible: true }), params())).status).toBe(403);

    mocks.publishToLibrary.mockResolvedValue([{ stageId: STAGE_ID, outcome: 'failed' }]);
    expect((await PATCH(request({ orgId: ORG_ID, visible: true }), params())).status).toBe(500);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not touch the library when the course is withdrawn from the catalog', async () => {
    const response = await PATCH(request({ orgId: ORG_ID, visible: false }), params());

    expect(response.status).toBe(200);
    expect(mocks.publishToLibrary).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ catalog_visible: false });
  });
});

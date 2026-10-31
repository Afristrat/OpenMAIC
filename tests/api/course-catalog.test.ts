import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000016';

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  requireMember: vi.fn(),
  order: vi.fn(),
  not: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgMember: mocks.requireMember }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));

import { GET } from '@/app/api/courses/catalog/route';

function request(orgId = ORG_ID): NextRequest {
  return new NextRequest(`https://qalem.ma/api/courses/catalog?orgId=${orgId}`);
}

describe('GET /api/courses/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: 'member-id', email: 'member@qalem.ma' } });
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.order.mockResolvedValue({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000017',
          title: 'Formation prête',
          language: 'fr-FR',
          stage_id: 'classroom_catalog_1',
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
    mocks.not.mockReturnValue({ order: mocks.order });
    mocks.eq.mockReturnValue({ eq: mocks.eq, not: mocks.not });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
  });

  it('requires an organization identifier before reading', async () => {
    const response = await GET(new NextRequest('https://qalem.ma/api/courses/catalog'));

    expect(response.status).toBe(400);
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('enforces organization membership before the catalog query', async () => {
    mocks.requireMember.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.requireMember).toHaveBeenCalledWith(expect.any(NextRequest), ORG_ID);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed while the catalogue flag is disabled', async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns only ready published courses from the requested organization', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'org_id', ORG_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'status', 'ready');
    expect(mocks.eq).toHaveBeenNthCalledWith(3, 'catalog_visible', true);
    expect(body.courses).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000017',
        title: 'Formation prête',
        language: 'fr-FR',
        classroomId: 'classroom_catalog_1',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
  });
});

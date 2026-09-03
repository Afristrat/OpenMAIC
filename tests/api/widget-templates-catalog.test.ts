import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  from: vi.fn(),
  templateOrder: vi.fn(),
  versionIn: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));

import { GET } from '@/app/api/widget-templates/route';

const templateId = '00000000-0000-4000-8000-000000000059';
const versionId = '00000000-0000-4000-8000-000000000060';
const composition = {
  version: 1,
  locale: 'ar-MA',
  direction: 'rtl',
  title: 'حاسبة الهامش',
  inputs: [],
  computations: [{ id: 'total', label: 'المجموع', expression: { op: 'literal', value: 42 } }],
  nodes: [{ id: 'result', type: 'computed_value', computationId: 'total' }],
  rootNodeIds: ['result'],
  goldenCases: [{ name: 'حالة مرجعية', inputs: {}, expected: { total: 42 } }],
};

function request(): NextRequest {
  return new NextRequest('https://qalem.ma/api/widget-templates');
}

describe('GET /api/widget-templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'user-id', email: 'user@qalem.ma' } });
    mocks.templateOrder.mockResolvedValue({
      data: [{ id: templateId, title: 'Calculateur de marge', published_version_id: versionId }],
      error: null,
    });
    mocks.versionIn.mockResolvedValue({
      data: [{ id: versionId, version_number: 3, composition }],
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'widget_templates') {
        return {
          select: () => ({ not: () => ({ order: mocks.templateOrder }) }),
        };
      }
      return { select: () => ({ in: mocks.versionIn }) };
    });
  });

  it('refuses anonymous access before querying persistence', async () => {
    mocks.requireAuth.mockResolvedValue({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns only safe metadata for validated published versions', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      templates: [
        {
          templateId,
          versionId,
          versionNumber: 3,
          title: 'Calculateur de marge',
          locale: 'ar-MA',
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('goldenCases');
    expect(mocks.versionIn).toHaveBeenCalledWith('id', [versionId]);
  });

  it('filters a corrupted persisted composition instead of exposing it', async () => {
    mocks.versionIn.mockResolvedValue({
      data: [
        { id: versionId, version_number: 3, composition: { ...composition, direction: 'ltr' } },
      ],
      error: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ templates: [] });
  });

  it('fails closed when the published-version query fails', async () => {
    mocks.versionIn.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    const response = await GET(request());

    expect(response.status).toBe(500);
  });
});

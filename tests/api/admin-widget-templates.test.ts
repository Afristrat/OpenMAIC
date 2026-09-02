import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { POST as CREATE } from '@/app/api/admin/widget-templates/route';
import { PATCH as REVISE } from '@/app/api/admin/widget-templates/[templateId]/route';
import { POST as PREVIEW } from '@/app/api/admin/widget-templates/[templateId]/preview/route';
import { POST as PUBLISH } from '@/app/api/admin/widget-templates/[templateId]/publish/route';

const actorId = '00000000-0000-4000-8000-000000000001';
const templateId = '00000000-0000-4000-8000-000000000059';
const versionId = '00000000-0000-4000-8000-000000000060';
const composition = {
  version: 1,
  locale: 'fr-FR',
  direction: 'ltr',
  title: 'Calcul simple',
  inputs: [],
  computations: [{ id: 'total', label: 'Total', expression: { op: 'literal', value: 42 } }],
  nodes: [{ id: 'result', type: 'computed_value', label: 'Résultat', computationId: 'total' }],
  rootNodeIds: ['result'],
  goldenCases: [{ name: 'cas nominal', inputs: {}, expected: { total: 42 } }],
};

function request(path: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return new NextRequest(`https://qalem.ma${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('super-admin widget template routes (S6-027)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({ user: { id: actorId, email: 'root@qalem.ma' } });
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, single: mocks.single });
  });

  it('creates a validated first draft through the audited atomic function', async () => {
    mocks.single.mockResolvedValue({
      data: { id: templateId, draft_version_id: versionId, version_number: 1 },
      error: null,
    });

    const response = await CREATE(
      request('/api/admin/widget-templates', 'POST', {
        slug: 'marge-simple',
        title: 'Marge simple',
        composition,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('create_widget_template', {
      actor_user_id: actorId,
      template_slug: 'marge-simple',
      template_title: 'Marge simple',
      template_composition: composition,
    });
  });

  it('creates a new immutable draft version instead of updating the previous version', async () => {
    mocks.single.mockResolvedValue({ data: { id: versionId, version_number: 2 }, error: null });

    const response = await REVISE(
      request(`/api/admin/widget-templates/${templateId}`, 'PATCH', {
        title: 'Marge révisée',
        composition,
      }),
      { params: Promise.resolve({ templateId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('revise_widget_template', {
      actor_user_id: actorId,
      target_template_id: templateId,
      template_title: 'Marge révisée',
      template_composition: composition,
    });
  });

  it('reloads and evaluates the exact draft version for preview', async () => {
    mocks.single.mockResolvedValue({
      data: { id: versionId, template_id: templateId, version_number: 2, composition },
      error: null,
    });

    const response = await PREVIEW(
      request(`/api/admin/widget-templates/${templateId}/preview`, 'POST', { versionId }),
      { params: Promise.resolve({ templateId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('widget_template_versions');
    expect(body.version.id).toBe(versionId);
    expect(body.evaluation.values.total).toBe(42);
  });

  it('publishes the selected immutable version with the authenticated actor', async () => {
    mocks.single.mockResolvedValue({
      data: { template_id: templateId, published_version_id: versionId, version_number: 2 },
      error: null,
    });

    const response = await PUBLISH(
      request(`/api/admin/widget-templates/${templateId}/publish`, 'POST', { versionId }),
      { params: Promise.resolve({ templateId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('publish_widget_template', {
      actor_user_id: actorId,
      target_template_id: templateId,
      target_version_id: versionId,
    });
  });

  it('never reaches the service-role client for a tenant administrator', async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ response: new Response(null, { status: 403 }) });

    const response = await CREATE(
      request('/api/admin/widget-templates', 'POST', {
        slug: 'interdit',
        title: 'Interdit',
        composition,
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid composition before touching persistence', async () => {
    const response = await CREATE(
      request('/api/admin/widget-templates', 'POST', {
        slug: 'dangereux',
        title: 'Dangereux',
        composition: {
          ...composition,
          nodes: [{ id: 'x', type: 'video' }],
          rootNodeIds: ['x'],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

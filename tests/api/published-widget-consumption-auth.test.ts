import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireOrgAuthor: vi.fn(),
  resolveModel: vi.fn(),
  callLLM: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: mocks.requireOrgAuthor,
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModel,
}));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));

import { POST } from '@/app/api/generate/scene-content/route';

const foreignOrgId = '00000000-0000-4000-8000-000000000099';

describe('published widget consumption authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgAuthor.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
  });

  it('refuses cross-tenant generation before loading the pinned widget or a model', async () => {
    const outline = {
      id: 'scene-widget',
      type: 'plugin',
      title: 'Calculateur',
      description: 'Calculer une marge.',
      keyPoints: [],
      order: 1,
      pluginType: 'published-widget',
      widgetTemplateId: '00000000-0000-4000-8000-000000000059',
      widgetTemplateVersionId: '00000000-0000-4000-8000-000000000060',
    };
    const request = new NextRequest('https://qalem.ma/api/generate/scene-content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        outline,
        allOutlines: [outline],
        stageId: 'foreign-stage',
        orgId: foreignOrgId,
        stageInfo: { name: 'Cours étranger' },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.requireOrgAuthor).toHaveBeenCalledWith(request, foreignOrgId);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000021';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  flag: vi.fn(),
  pipeline: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAuthor: mocks.auth }));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: mocks.flag }));
vi.mock('@/lib/server/course-import-pipeline', () => ({
  runCourseImportPipeline: mocks.pipeline,
}));

import { GET, POST } from '@/app/api/courses/import/route';

function getRequest(): NextRequest {
  return new NextRequest(`https://qalem.ma/api/courses/import?orgId=${ORG_ID}`);
}

function postRequest(): NextRequest {
  const form = new FormData();
  form.set('orgId', ORG_ID);
  form.set('rightsAttested', 'true');
  form.set('providerId', 'mineru');
  form.set('file', new Blob(['# Canevas'], { type: 'application/pdf' }), 'canevas.pdf');
  return new NextRequest('https://qalem.ma/api/courses/import', { method: 'POST', body: form });
}

describe('/api/courses/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: { id: 'author-1', email: 'author@qalem.ma' },
      authoredByRole: 'author',
    });
    mocks.flag.mockResolvedValue(true);
  });

  it('reports the fail-closed feature flag to an authorized author', async () => {
    mocks.flag.mockResolvedValue(false);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false });
    expect(mocks.flag).toHaveBeenCalledWith('import_pipeline');
  });

  it('refuses cross-tenant uploads before reading the flag or the file', async () => {
    mocks.auth.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    expect(mocks.flag).not.toHaveBeenCalled();
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });

  it('persists a conforming MinerU import and returns its editable plan', async () => {
    mocks.pipeline.mockResolvedValue({
      importId: 'import-1',
      courseId: 'course-1',
      sourceManifestId: 'manifest-1',
      validation: { status: 'conform', language: 'fr-FR', issues: [] },
      plan: { courseTitle: 'Canevas', outlines: [{ id: 'scene-1' }] },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      courseId: 'course-1',
      sourceManifestId: 'manifest-1',
      validation: { status: 'conform' },
    });
    expect(mocks.pipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'author-1',
        orgId: ORG_ID,
        originalFilename: 'canevas.pdf',
        mimeType: 'application/pdf',
        rightsAttested: true,
        pdfProviderId: 'mineru',
      }),
    );
  });

  it('returns the persisted rule diagnostics for a rejected canvas', async () => {
    mocks.pipeline.mockResolvedValue({
      importId: 'import-rejected',
      validation: {
        status: 'rejected',
        issues: [{ rule: 'CI-07', message: 'Règle CI-07 : aucun chapitre.' }],
      },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      importId: 'import-rejected',
      validation: { status: 'rejected', issues: [{ rule: 'CI-07' }] },
    });
  });
});

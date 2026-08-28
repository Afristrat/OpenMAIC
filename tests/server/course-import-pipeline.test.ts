import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  extract: vi.fn(),
  validate: vi.fn(),
  toPlan: vi.fn(),
  ingest: vi.fn(),
  replaceManifest: vi.fn(),
  persistDraft: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
vi.mock('@/lib/server/course-import-document', () => ({
  extractCourseImportDocument: mocks.extract,
}));
vi.mock('@/lib/server/course-import-storage', () => ({
  validateAndPersistCourseImport: mocks.validate,
}));
vi.mock('@/lib/courses/import-canvas-to-plan', () => ({
  importCanvasToClassroomPlan: mocks.toPlan,
}));
vi.mock('@/lib/server/formation-source-library', () => ({
  ingestOrganizationSource: mocks.ingest,
  replaceSourceManifest: mocks.replaceManifest,
}));
vi.mock('@/lib/server/course-storage', () => ({
  persistImportedCourseDraft: mocks.persistDraft,
}));

import { runCourseImportPipeline } from '@/lib/server/course-import-pipeline';

const input = {
  ownerId: 'owner-1',
  orgId: 'org-1',
  originalFilename: 'canevas.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4'),
  rightsAttested: true,
  pdfProviderId: 'mineru' as const,
};

describe('runCourseImportPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.extract.mockResolvedValue({
      parserId: 'mineru',
      content: { text: '# Canevas conforme', images: [] },
    });
    mocks.toPlan.mockReturnValue({
      courseTitle: 'Canevas conforme',
      outlines: [{ id: 'scene-1' }],
    });
    mocks.ingest.mockResolvedValue({ source: { id: 'source-1' }, duplicate: false });
    mocks.replaceManifest.mockResolvedValue({ id: 'manifest-1' });
    mocks.persistDraft.mockResolvedValue('course-1');
  });

  it('persists the private file, immutable source and imported draft for a conforming canvas', async () => {
    mocks.validate.mockResolvedValue({
      importId: 'import-1',
      validation: { status: 'conform', language: 'fr-FR', issues: [] },
    });

    await expect(runCourseImportPipeline(input)).resolves.toMatchObject({
      importId: 'import-1',
      courseId: 'course-1',
      sourceManifestId: 'manifest-1',
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^owner-1\/course-imports\/[0-9a-f-]+\.pdf$/),
      input.buffer,
      { contentType: 'application/pdf', upsert: false },
    );
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        parserId: 'mineru',
        content: { text: '# Canevas conforme', images: [] },
      }),
    );
    expect(mocks.persistDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        importId: 'import-1',
        sourceManifestId: 'manifest-1',
        language: 'fr-FR',
      }),
    );
  });

  it('keeps the persisted rejection but creates neither source nor course', async () => {
    mocks.validate.mockResolvedValue({
      importId: 'import-rejected',
      validation: { status: 'rejected', issues: [{ rule: 'CI-07' }] },
    });

    await expect(runCourseImportPipeline(input)).resolves.toMatchObject({
      importId: 'import-rejected',
      validation: { status: 'rejected' },
    });
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.persistDraft).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

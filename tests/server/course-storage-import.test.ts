import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  eqOwner: vi.fn(),
  eqOrg: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

import { persistGeneratedCourse, persistImportedCourseDraft } from '@/lib/server/course-storage';

const outline = {
  id: 'scene-1',
  type: 'slide',
  title: 'Décider',
  description: 'Apprendre à décider.',
  keyPoints: ['Comparer les options'],
  order: 1,
} as const;

describe('course storage import lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.single.mockResolvedValue({ data: { id: 'course-imported' }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'course-imported' }, error: null });
    mocks.select.mockReturnValue({ single: mocks.single, maybeSingle: mocks.maybeSingle });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.update.mockReturnValue({ eq: mocks.eqOwner });
    mocks.eqOwner.mockReturnValue({ eq: mocks.eqOrg });
    mocks.eqOrg.mockReturnValue({ select: mocks.select });
    mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update });
  });

  it('creates a draft linked to its import and immutable source manifest', async () => {
    await persistImportedCourseDraft({
      ownerId: 'owner-1',
      orgId: 'org-1',
      importId: 'import-1',
      sourceManifestId: 'manifest-1',
      title: 'Décider',
      language: 'fr-FR',
      outlines: [outline],
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        import_id: 'import-1',
        source_manifest_id: 'manifest-1',
        source_kind: 'imported',
        status: 'draft',
      }),
    );
  });

  it('marks the same course ready without overwriting its imported identity', async () => {
    await persistGeneratedCourse({
      courseId: 'course-imported',
      ownerId: 'owner-1',
      orgId: 'org-1',
      stageId: 'stage-1',
      title: 'Décider',
      language: 'fr-FR',
      outlines: [outline],
      sourceManifestId: 'manifest-1',
    });

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage_id: 'stage-1', status: 'ready' }),
    );
    const payload = mocks.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('source_kind');
    expect(payload).not.toHaveProperty('import_id');
  });
});

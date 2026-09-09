import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importCanvasToClassroomPlan } from '@/lib/courses/import-canvas-to-plan';
const mocks = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), result: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));
import { recoverImportedCoursePlan } from '@/lib/server/course-plan-recovery';
const sourceId = '00000000-0036-4000-8000-000000000151';
const canvas = `# Décider
## Résultat professionnel visé
Comparer les options.
## Pour qui et dans quel contexte
Des adultes en entreprise.
## Chapitre 1
### Objectif observable
Argumenter une décision.
### Contenu essentiel
Comparer les conséquences.
### Mise en pratique ou point de contrôle
Présenter une décision justifiée.
## Preuve finale d’application
Une décision argumentée.`;
const original = importCanvasToClassroomPlan(canvas, 'fr-FR');
const course = {
  id: 'course',
  title: 'Titre déjà retouché',
  language: 'fr-FR' as const,
  source_manifest_id: 'manifest',
  import_id: 'import',
  source_kind: 'imported' as const,
  status: 'draft' as const,
  outline: {
    scenes: original.outlines.map((scene) => ({ ...scene, title: `Modifié : ${scene.title}` })),
  },
};
describe('legacy plan recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: () => query,
      eq: mocks.eq,
      abortSignal: () => query,
      maybeSingle: mocks.result,
    };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.result
      .mockReset()
      .mockResolvedValueOnce({ data: { original_filename: 'canvas.md' } })
      .mockResolvedValueOnce({ data: { source_ids: [sourceId], diwan_references: [] } })
      .mockResolvedValueOnce({ data: { text_content: canvas } });
  });
  it('recovers the syllabus while preserving the saved title and scenes', async () => {
    const plan = await recoverImportedCoursePlan(course, 'org', 'owner');
    expect(plan).toEqual({
      ...original,
      courseTitle: course.title,
      outlines: course.outline.scenes,
    });
    expect(mocks.eq).toHaveBeenCalledWith('owner_id', 'owner');
    expect(mocks.eq).toHaveBeenCalledWith('org_id', 'org');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'manifest');
    expect(mocks.eq).toHaveBeenCalledWith('id', sourceId);
    expect(mocks.eq).toHaveBeenCalledWith('name', 'canvas.md');
    expect(mocks.eq).toHaveBeenCalledWith('validation_status', 'conform');
  });
  it.each([
    { ...course, outline: { ...course.outline, plan: {} } },
    { ...course, source_kind: 'generated' as const },
    { ...course, status: 'ready' as const },
  ])('does not replace an existing plan or guess a non-imported draft', async (candidate) => {
    expect(await recoverImportedCoursePlan(candidate, 'org', 'owner')).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('refuses ambiguous source selection without querying external sources', async () => {
    mocks.result
      .mockReset()
      .mockResolvedValueOnce({ data: { original_filename: 'canvas.md' } })
      .mockResolvedValueOnce({ data: { source_ids: [sourceId, sourceId], diwan_references: [] } });
    expect(await recoverImportedCoursePlan(course, 'org', 'owner')).toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith('organization_sources');
  });
  it('does not swallow a storage failure as an absent plan', async () => {
    mocks.result.mockReset().mockResolvedValueOnce({ error: { message: 'private' } });
    await expect(recoverImportedCoursePlan(course, 'org', 'owner')).rejects.toThrow(
      'Import lookup unavailable',
    );
  });
  it('does not discard invalid saved scenes', async () => {
    expect(
      await recoverImportedCoursePlan({ ...course, outline: { scenes: [] } }, 'org', 'owner'),
    ).toBeNull();
  });
});

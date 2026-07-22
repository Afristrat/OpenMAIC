import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const mocks = vi.hoisted(() => ({
  stagesSingle: vi.fn(),
  scenesOrder: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'stages') {
        return {
          select: () => ({
            eq: () => ({
              single: () => mocks.stagesSingle(),
            }),
          }),
        };
      }
      if (table === 'scenes') {
        return {
          select: () => ({
            eq: () => ({
              order: () => mocks.scenesOrder(),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Dynamic import after mocks are registered (vi.mock is hoisted, but keeping
// the import here documents the dependency order explicitly).
const { buildLearningPackage, buildScormPackage } =
  await import('@/lib/export/scorm/build-scorm-package');

describe('buildScormPackage', () => {
  it('builds a SCORM 1.2 zip whose SCO uses the LMS API instead of a local mock', async () => {
    mocks.stagesSingle.mockResolvedValue({
      data: { id: 'stage-1', name: 'Cours Test', description: 'Un cours', language: 'fr-FR' },
      error: null,
    });
    mocks.scenesOrder.mockResolvedValue({
      data: [
        {
          id: 'sc-1',
          type: 'quiz',
          title: 'Quiz',
          order: 0,
          content: { type: 'quiz', questions: [] },
        },
      ],
      error: null,
    });

    const { zip, sceneCount } = await buildScormPackage('stage-1');
    expect(sceneCount).toBe(1);

    const parsed = await JSZip.loadAsync(zip);
    const manifest = await parsed.file('imsmanifest.xml')?.async('string');
    const index = await parsed.file('index.html')?.async('string');

    expect(manifest).toContain('adlcp:scormtype="sco"');
    expect(manifest).toContain('href="index.html"');
    expect(index).toContain('Cours Test');
    expect(index).toContain("findApi('API')");
    expect(index).toContain('LMSInitialize');
    expect(index).not.toContain('new Scorm12API');
    expect(parsed.file('scorm12.min.js')).toBeNull();
  });

  it.each([
    ['scorm2004', 'imsmanifest.xml', 'API_1484_11'],
    ['cmi5', 'cmi5.xml', 'auth-token'],
  ] as const)(
    'reuses one content generator for %s and changes only tracking metadata',
    async (format, manifestName, trackingMarker) => {
      mocks.stagesSingle.mockResolvedValue({
        data: { id: 'stage-1', name: 'Cours Test', description: 'Un cours', language: 'fr-FR' },
        error: null,
      });
      mocks.scenesOrder.mockResolvedValue({
        data: [
          {
            id: 'sc-1',
            type: 'quiz',
            title: 'Quiz',
            order: 0,
            content: { type: 'quiz', questions: [] },
          },
        ],
        error: null,
      });

      const { zip } = await buildLearningPackage('stage-1', format);
      const parsed = await JSZip.loadAsync(zip);
      const manifest = await parsed.file(manifestName)?.async('string');
      const index = await parsed.file('index.html')?.async('string');

      expect(manifest).toContain('Cours Test');
      expect(index).toContain('Cours Test');
      expect(index).toContain('Quiz');
      expect(index).toContain(trackingMarker);
    },
  );

  it('rejects with a clear error when the stage has no scenes', async () => {
    mocks.stagesSingle.mockResolvedValue({
      data: { id: 'stage-empty', name: 'Vide', description: null, language: 'fr-FR' },
      error: null,
    });
    mocks.scenesOrder.mockResolvedValue({ data: [], error: null });

    await expect(buildScormPackage('stage-empty')).rejects.toThrow(/aucune scène/i);
  });

  it('rejects with a clear error when the stage does not exist', async () => {
    mocks.stagesSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    await expect(buildScormPackage('missing-stage')).rejects.toThrow(/introuvable/i);
  });
});

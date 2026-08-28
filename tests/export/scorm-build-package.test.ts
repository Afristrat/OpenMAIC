import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildPcm16Wav } from '@/tests/audio/pcm16-wav-fixture';

const mocks = vi.hoisted(() => ({
  stagesSingle: vi.fn(),
  scenesOrder: vi.fn(),
  storageDownload: vi.fn(),
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
    storage: {
      from: () => ({ download: mocks.storageDownload }),
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Dynamic import after mocks are registered (vi.mock is hoisted, but keeping
// the import here documents the dependency order explicitly).
const { buildLearningPackage, buildLearningPackageFromData, buildScormPackage } =
  await import('@/lib/export/scorm/build-scorm-package');

describe('buildScormPackage', () => {
  beforeEach(() => {
    mocks.storageDownload.mockReset();
    mocks.storageDownload.mockResolvedValue({ data: null, error: { message: 'not found' } });
  });

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
          actions: [],
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
            actions: [],
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

  it.each([
    ['fr-FR', 'fr', 'ltr', 'Marquer comme terminé', 'Le LMS n’a pas pu confirmer'],
    ['ar-MA', 'ar', 'rtl', 'وضع علامة كمكتمل', 'تعذّر تأكيد الإكمال'],
    ['en-US', 'en', 'ltr', 'Mark as complete', 'The LMS could not confirm'],
  ] as const)(
    'localizes the offline shell and reports completion only after LMS confirmation for %s',
    async (language, htmlLanguage, direction, completeLabel, unavailableLabel) => {
      const { zip } = await buildLearningPackageFromData(
        { id: `stage-${htmlLanguage}`, name: 'Course', description: null, language },
        [
          {
            id: 'scene-1',
            type: 'quiz',
            title: 'Quiz',
            order: 0,
            content: { type: 'quiz', questions: [] },
            actions: [],
          },
        ],
        'cmi5',
      );
      const index = await (await JSZip.loadAsync(zip)).file('index.html')!.async('string');

      expect(index).toContain(`<html lang="${htmlLanguage}" dir="${direction}">`);
      expect(index).toContain(completeLabel);
      expect(index).toContain(unavailableLabel);
      expect(index).toContain("window.addEventListener('pagehide', terminateTrackingInBackground)");
      expect(index).toMatch(
        /track\('complete'\)\.then\(terminateTracking\)\.then\(function \(\) \{\s+statusEl\.textContent/,
      );
    },
  );

  it('rejects with a clear error when the stage does not exist', async () => {
    mocks.stagesSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    await expect(buildScormPackage('missing-stage')).rejects.toThrow(/introuvable/i);
  });

  it('keeps content and offline media identical across the three tracking adapters', async () => {
    const stage = {
      id: 'stage-media',
      name: 'Cours média',
      description: 'Cours autonome',
      language: 'fr-FR',
    };
    const scenes = [
      {
        id: 'scene-widget',
        type: 'interactive',
        title: 'Widget',
        order: 0,
        content: { type: 'interactive', html: '<script>window.liveQalem = true</script>' },
        actions: [],
      },
    ];
    const snapshot = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const narration = new Uint8Array([82, 73, 70, 70, 4, 5, 6]);
    const media = {
      snapshots: new Map([['scene-widget', snapshot]]),
      audio: new Map([['scene-widget', [{ data: narration, extension: 'wav' }]]]),
    };

    const packages = await Promise.all(
      (['scorm12', 'scorm2004', 'cmi5'] as const).map(async (format) => {
        const { zip } = await buildLearningPackageFromData(stage, scenes, format, media);
        return JSZip.loadAsync(zip);
      }),
    );
    const indexes = await Promise.all(
      packages.map((archive) => archive.file('index.html')!.async('string')),
    );
    const contentShells = indexes.map((index) =>
      index.replace(/<script>[\s\S]*<\/script>/, '<script>TRACKING_ADAPTER</script>'),
    );

    expect(new Set(contentShells).size).toBe(1);
    for (const [archive, index] of packages.map((archive, i) => [archive, indexes[i]] as const)) {
      expect(await archive.file('assets/scenes/scene-1.png')?.async('uint8array')).toEqual(
        await packages[0].file('assets/scenes/scene-1.png')?.async('uint8array'),
      );
      expect(await archive.file('assets/audio/scene-1-1.wav')?.async('uint8array')).toEqual(
        narration,
      );
      expect(index).toContain('Widget présenté sous forme de capture statique.');
      expect(index).toContain('assets/scenes/scene-1.png');
      expect(index).toContain('assets/audio/scene-1-1.wav');
      expect(index).not.toContain('window.liveQalem');
    }
  });

  it('fails closed when a persisted speech action has no audio', async () => {
    mocks.stagesSingle.mockResolvedValue({
      data: { id: 'stage-1', name: 'Cours Test', description: null, language: 'fr-FR' },
      error: null,
    });
    mocks.scenesOrder.mockResolvedValue({
      data: [
        {
          id: 'sc-1',
          type: 'slide',
          title: 'Narration',
          order: 0,
          content: { type: 'slide', canvas: { elements: [] } },
          actions: [{ id: 'speech-1', type: 'speech', text: 'Bonjour' }],
        },
      ],
      error: null,
    });

    await expect(buildScormPackage('stage-1')).rejects.toThrow(/prise.*parole sans audio/i);
  });

  it('downloads persistent narration and embeds it with the static scene capture', async () => {
    const snapshot = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const narration = buildPcm16Wav([16000, -16000, 12000, -12000]);
    mocks.stagesSingle.mockResolvedValue({
      data: { id: 'stage-1', name: 'Cours Test', description: null, language: 'fr-FR' },
      error: null,
    });
    mocks.scenesOrder.mockResolvedValue({
      data: [
        {
          id: 'sc-1',
          type: 'slide',
          title: 'Narration',
          order: 0,
          content: { type: 'slide', canvas: { elements: [] } },
          actions: [
            {
              id: 'speech-1',
              type: 'speech',
              text: 'Bonjour',
              audioUrl: '/api/classroom-media/stage-1/audio/teacher.wav?v=sha',
            },
          ],
        },
      ],
      error: null,
    });
    mocks.storageDownload
      .mockResolvedValueOnce({ data: new Blob([snapshot], { type: 'image/png' }), error: null })
      .mockResolvedValueOnce({ data: new Blob([narration], { type: 'audio/wav' }), error: null });

    const { zip } = await buildScormPackage('stage-1');
    const archive = await JSZip.loadAsync(zip);
    expect(await archive.file('assets/audio/scene-1-1.wav')?.async('uint8array')).toEqual(
      narration,
    );
    expect(await archive.file('index.html')?.async('string')).toContain(
      'assets/audio/scene-1-1.wav',
    );
    expect(mocks.storageDownload).toHaveBeenNthCalledWith(2, 'stage-1/audio/teacher.wav');
  });
});

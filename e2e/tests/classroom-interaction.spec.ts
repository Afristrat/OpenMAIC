import { test, expect } from '../fixtures/base';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { defaultTheme } from '../fixtures/test-data/scene-content';

const TEST_STAGE_ID = 'e2e-test-stage';
const LIVE_SPEECH_TEST = 'speaks a live agent intervention after a learner message';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });
const LIVE_TTS_SETTINGS_STORAGE = createSettingsStorage(
  {
    sidebarCollapsed: false,
    ttsEnabled: true,
    ttsMuted: false,
    ttsVolume: 1,
    ttsProviderId: 'browser-native-tts',
    ttsVoice: 'e2e-voice',
    ttsProvidersConfig: {
      'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
    },
  },
  5,
);

/** Seed IndexedDB with stage + 3 scenes using raw IndexedDB API */
async function seedDatabase(
  page: import('@playwright/test').Page,
  settingsStorage = SETTINGS_STORAGE,
) {
  // Inject settings before navigating so it's available immediately on load
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'en-US');
  }, settingsStorage);

  // Navigate to the app page first — this causes Dexie to open/create the DB at v8
  // with the correct schema. We wait for network idle to ensure Dexie is done.
  // (root at '/' now serves the marketing landing page, not the app bundle)
  await page.goto('/app', { waitUntil: 'networkidle' });

  // Now seed data by opening the DB at its current version (no upgrade).
  // Opening without a version number returns the current version without triggering
  // onupgradeneeded, so we can safely write to the already-initialized schema.
  const seedStageData = () =>
    page.evaluate(
      ({ stageId, theme }) => {
        return new Promise<void>((resolve, reject) => {
          // Open without specifying version — uses current DB version, no upgrade event
          const request = indexedDB.open('MAIC-Database');

          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
            const now = Date.now();

            tx.objectStore('stages').put({
              id: stageId,
              name: '光合作用',
              description: '',
              language: 'zh-CN',
              style: 'professional',
              createdAt: now,
              updatedAt: now,
            });

            // Scene content uses SlideContent shape: { type: 'slide', canvas: Slide }
            const makeSlideContent = (title: string, elId: string) => ({
              type: 'slide',
              canvas: {
                id: `slide-${elId}`,
                viewportSize: 1000,
                viewportRatio: 0.5625,
                theme,
                elements: [
                  {
                    type: 'text',
                    id: `el-${elId}`,
                    content: title,
                    left: 50,
                    top: 50,
                    width: 900,
                    height: 100,
                  },
                ],
              },
            });

            const scenes = [
              {
                id: 'scene-0',
                stageId,
                type: 'slide',
                title: '基本概念',
                order: 0,
                content: makeSlideContent('基本概念', '0'),
                actions: [
                  {
                    id: 'export-audio',
                    type: 'speech',
                    text: 'Narration exportée',
                    audioUrl: `/api/classroom-media/${stageId}/audio/narration.wav`,
                  },
                ],
                createdAt: now,
                updatedAt: now,
              },
              {
                id: 'scene-1',
                stageId,
                type: 'slide',
                title: '光反应',
                order: 1,
                content: makeSlideContent('光反应', '1'),
                createdAt: now,
                updatedAt: now,
              },
              {
                id: 'scene-2',
                stageId,
                type: 'slide',
                title: '暗反应',
                order: 2,
                content: makeSlideContent('暗反应', '2'),
                createdAt: now,
                updatedAt: now,
              },
            ];
            for (const scene of scenes) {
              tx.objectStore('scenes').put(scene);
            }

            // Empty outlines = all scenes generated, no pending work
            // StageOutlinesRecord requires createdAt + updatedAt
            tx.objectStore('stageOutlines').put({
              stageId,
              outlines: [],
              createdAt: now,
              updatedAt: now,
            });

            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };

          request.onerror = () => reject(request.error);
        });
      },
      { stageId: TEST_STAGE_ID, theme: defaultTheme },
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await seedStageData();
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Execution context was destroyed') || attempt === 2) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

test.describe('Classroom Interaction', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await seedDatabase(
      page,
      testInfo.title === LIVE_SPEECH_TEST ? LIVE_TTS_SETTINGS_STORAGE : SETTINGS_STORAGE,
    );
  });

  test('loads classroom and switches scenes', async ({ page }) => {
    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    // Sidebar shows 3 scenes
    await expect(classroom.sidebarScenes).toHaveCount(3, { timeout: 10_000 });

    // First scene title visible
    await expect(classroom.getSceneTitle(0)).toContainText('基本概念');

    // Click second scene
    await classroom.clickScene(1);

    // Verify second scene is now active — heading in the top bar shows the current scene name
    await expect(page.getByRole('heading', { name: '光反应' })).toBeVisible();
  });

  test('keeps body spacing stable for header menus and settings modal', async ({ page }) => {
    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    const initialBodySpacing = await page.evaluate(() => {
      const styles = getComputedStyle(document.body);
      return {
        paddingRight: styles.paddingRight,
        marginRight: styles.marginRight,
      };
    });

    const expectBodyScrollState = async (locked: boolean) => {
      await expect
        .poll(() =>
          page.evaluate(() => ({
            locked: document.body.hasAttribute('data-scroll-locked'),
            paddingRight: getComputedStyle(document.body).paddingRight,
            marginRight: getComputedStyle(document.body).marginRight,
          })),
        )
        .toEqual({
          locked,
          paddingRight: initialBodySpacing.paddingRight,
          marginRight: initialBodySpacing.marginRight,
        });
    };

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'English' })).toBeVisible();
    await expectBodyScrollState(false);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'English' })).toBeHidden();

    await page.getByRole('button', { name: 'Theme' }).click();
    await expect(page.getByRole('menuitem', { name: 'Light' })).toBeVisible();
    await expectBodyScrollState(false);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Light' })).toBeHidden();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectBodyScrollState(true);
  });

  test(LIVE_SPEECH_TEST, async ({ page }) => {
    const agentSpeech = 'Apply this idea to one decision you make at work.';

    await page.addInitScript(() => {
      const spokenTexts: string[] = [];
      Object.defineProperty(window, '__e2eSpokenTexts', { value: spokenTexts });

      class MockSpeechSynthesisUtterance {
        readonly text: string;
        rate = 1;
        pitch = 1;
        volume = 1;
        lang = '';
        voice: SpeechSynthesisVoice | null = null;
        onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
        onend: ((event: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
        onpause: ((event: SpeechSynthesisEvent) => void) | null = null;
        onresume: ((event: SpeechSynthesisEvent) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      }

      const voice = {
        default: true,
        lang: 'en-US',
        localService: true,
        name: 'E2E Voice',
        voiceURI: 'e2e-voice',
      } as SpeechSynthesisVoice;
      const speechSynthesis = {
        onvoiceschanged: null,
        paused: false,
        pending: false,
        speaking: false,
        getVoices: () => [voice],
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        speak: (utterance: MockSpeechSynthesisUtterance) => {
          spokenTexts.push(utterance.text);
          queueMicrotask(() => {
            utterance.onstart?.({} as SpeechSynthesisEvent);
            utterance.onend?.({} as SpeechSynthesisEvent);
          });
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      } as unknown as SpeechSynthesis;

      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: MockSpeechSynthesisUtterance,
      });
      Object.defineProperty(window, 'speechSynthesis', { value: speechSynthesis });
    });

    await page.route('**/api/chat', async (route) => {
      const events = [
        {
          type: 'agent_start',
          data: {
            messageId: 'e2e-live-message',
            agentId: 'default-1',
            agentName: 'E2E Teacher',
            agentAvatar: '/avatars/teacher.png',
            agentColor: '#3b82f6',
          },
        },
        {
          type: 'text_delta',
          data: { messageId: 'e2e-live-message', content: agentSpeech },
        },
        {
          type: 'agent_end',
          data: { messageId: 'e2e-live-message', agentId: 'default-1' },
        },
        { type: 'cue_user', data: { fromAgentId: 'default-1' } },
        {
          type: 'done',
          data: {
            totalActions: 0,
            totalAgents: 1,
            agentHadContent: true,
            directorState: { turnCount: 1, agentResponses: [], whiteboardLedger: [] },
          },
        },
      ];
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    });

    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();
    await page.getByRole('button', { name: 'Text input' }).click();
    await page.getByPlaceholder('Type your message...').fill('How can I use this at work?');
    await page.getByPlaceholder('Type your message...').press('Enter');

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __e2eSpokenTexts: string[] }).__e2eSpokenTexts.join(' '),
        ),
      )
      .toContain(agentSpeech);
  });

  test('exports the complete classroom as an MP4 download', async ({ page, mockApi }) => {
    await mockApi.mockMp4ExportDone();
    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    await page.getByRole('button', { name: 'Export PPTX' }).click();
    const mp4Export = page.getByTestId('export-mp4');
    await expect(mp4Export).toContainText('MP4 video');
    const downloadPromise = page.waitForEvent('download');
    await mp4Export.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.mp4');
  });

  test('exports every downloadable format from the current editable classroom', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockMp4ExportDone('e2e-all-export-formats');
    await page.route('**/api/export-jobs', (route) => {
      const { format } = route.request().postDataJSON() as { format: string };
      return route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, id: `e2e-export-${format}`, status: 'queued' }),
      });
    });
    await page.route('**/api/export-jobs/*', (route) => {
      const format = route.request().url().split('/').pop()!;
      const extension = format === 'cmi5' ? 'cmi5.zip' : `${format}.zip`;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          id: `e2e-export-${format}`,
          status: 'done',
          done: true,
          downloadUrl: `https://example.com/e2e-export.${extension}`,
        }),
      });
    });
    await page.route('https://example.com/e2e-export.*', (route) => {
      const filename = route.request().url().split('/').pop()!;
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: 'PK',
      });
    });
    await page.route(`**/api/classroom-media/${TEST_STAGE_ID}/audio/narration.wav`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'audio/wav' },
        body: 'RIFFtest',
      }),
    );
    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    const downloadFromMenu = async (testId: string) => {
      await page.getByRole('button', { name: 'Export PPTX' }).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId(testId).click();
      return downloadPromise;
    };

    const pptx = await downloadFromMenu('export-pptx');
    const pptxPath = await pptx.path();
    expect(pptxPath).not.toBeNull();
    const pptxArchive = await JSZip.loadAsync(await readFile(pptxPath!));
    expect(pptxArchive.file('[Content_Types].xml')).not.toBeNull();

    const resourcePack = await downloadFromMenu('export-resource-pack');
    const resourcePackPath = await resourcePack.path();
    expect(resourcePackPath).not.toBeNull();
    const resourcePackArchive = await JSZip.loadAsync(await readFile(resourcePackPath!));
    expect(Object.keys(resourcePackArchive.files).some((path) => path.endsWith('.pptx'))).toBe(true);

    const qalemArchive = await downloadFromMenu('export-classroom-zip');
    const archivePath = await qalemArchive.path();
    expect(archivePath).not.toBeNull();
    const archive = await JSZip.loadAsync(await readFile(archivePath!));
    expect(archive.file('manifest.json')).not.toBeNull();
    expect(archive.file('audio/narration.wav')).not.toBeNull();

    for (const [testId, suffix] of [
      ['export-scorm12', '.scorm12.zip'],
      ['export-scorm2004', '.scorm2004.zip'],
      ['export-cmi5', '.cmi5.zip'],
    ] as const) {
      const learningPackage = await downloadFromMenu(testId);
      expect(learningPackage.suggestedFilename()).toMatch(
        new RegExp(`${suffix.replaceAll('.', '\\.').replace('+', '\\+')}$`, 'i'),
      );
    }
  });
});

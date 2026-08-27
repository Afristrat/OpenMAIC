import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { captureExpectedBrowserConsole } from '../fixtures/expected-console';

const TRANSCRIPTION = 'Le texte transcrit est visible dans Qalem.';

const ASR_SETTINGS = createSettingsStorage({
  asrEnabled: true,
  asrProviderId: 'openai-whisper',
  asrLanguage: 'fr',
  asrProvidersConfig: {
    'openai-whisper': {
      apiKey: '',
      baseUrl: '',
      enabled: true,
      isServerConfigured: true,
      modelId: 'whisper-1',
    },
  },
  autoConfigApplied: true,
});

async function installMicrophone(page: HomePage['page'], permissionGranted = true) {
  await page.addInitScript(
    ({ settings, granted }) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'en-US');

      const track = { stop: () => undefined } as unknown as MediaStreamTrack;
      const stream = { getTracks: () => [track] } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (!granted) {
              throw new DOMException('Permission denied', 'NotAllowedError');
            }
            return stream;
          },
        },
      });

      class FakeMediaRecorder {
        static isTypeSupported(type: string) {
          return type === 'audio/webm;codecs=opus';
        }

        readonly stream: MediaStream;
        readonly mimeType: string;
        state: RecordingState = 'inactive';
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        onstop: (() => void) | null = null;

        constructor(mediaStream: MediaStream, options?: MediaRecorderOptions) {
          this.stream = mediaStream;
          this.mimeType = options?.mimeType || 'audio/webm';
        }

        start() {
          this.state = 'recording';
        }

        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({
            data: new Blob(['recorded speech'], { type: this.mimeType }),
          } as BlobEvent);
          this.onstop?.();
        }
      }

      window.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;
    },
    { settings: ASR_SETTINGS, granted: permissionGranted },
  );
}

async function mockManagedWhisper(page: HomePage['page']) {
  await page.route('**/api/server-providers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: {},
        tts: {},
        asr: { 'openai-whisper': {} },
        pdf: {},
        image: {},
        video: {},
        webSearch: {},
      }),
    }),
  );
}

test.describe('Whisper microphone flow', () => {
  test('records, sends and inserts the visible transcription into Qalem', async ({ page }) => {
    await installMicrophone(page);
    await mockManagedWhisper(page);
    let submittedAudio = false;
    await page.route('**/api/transcription', async (route) => {
      submittedAudio = (route.request().postDataBuffer()?.length ?? 0) > 0;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, text: TRANSCRIPTION }),
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await expect(home.textarea).toBeVisible();
    await page.getByRole('button', { name: 'Voice input' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();

    await expect(home.textarea).toHaveValue(TRANSCRIPTION);
    expect(submittedAudio).toBe(true);
  });

  test('reports a microphone permission refusal without sending audio', async ({ page }) => {
    await installMicrophone(page, false);
    await mockManagedWhisper(page);

    const home = new HomePage(page);
    await home.goto();
    const consoleCapture = await captureExpectedBrowserConsole(
      page,
      'error',
      '[AudioRecorder] Failed to start recording:',
    );
    await page.getByRole('button', { name: 'Voice input' }).click();

    await expect(page.getByText('Failed to access microphone')).toBeVisible();
    const messages = await consoleCapture.stop();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Permission denied');
  });

  test('reports an upstream transcription failure after recording', async ({ page }) => {
    await installMicrophone(page);
    await mockManagedWhisper(page);
    await page.route('**/api/transcription', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Transcription failed' }),
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    const consoleCapture = await captureExpectedBrowserConsole(
      page,
      'error',
      '[AudioRecorder] Transcription error:',
    );
    await page.getByRole('button', { name: 'Voice input' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();

    await expect(page.getByText('Speech recognition failed')).toBeVisible();
    const messages = await consoleCapture.stop();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('upstream-failed');
  });
});

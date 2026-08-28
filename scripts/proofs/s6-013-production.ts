import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { binarize, Decoder, Detector, grayscale } from '@nuintun/qrcode';
import { chromium, type APIRequestContext, type Page } from '@playwright/test';
import JSZip from 'jszip';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const BASE_URL = process.env.PROOF_BASE_URL ?? 'https://qalem.ma';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
const MARKER = process.env.PROOF_MARKER ?? `s6013-${Date.now()}`;
const ARTIFACT_DIR = process.env.PROOF_ARTIFACT_DIR ?? join(tmpdir(), MARKER);
const SHA = process.env.PROOF_SHA ?? 'unknown';
const HARNESS_SHA = process.env.PROOF_HARNESS_SHA ?? 'unknown';
const PLAN_TIMEOUT_MS = 15 * 60_000;
const GENERATION_TIMEOUT_MS = 45 * 60_000;
const EXPORT_TIMEOUT_MS = 45 * 60_000;

assert(EMAIL, 'PROOF_EMAIL is required');
assert(PASSWORD, 'PROOF_PASSWORD is required');

type JsonObject = Record<string, unknown>;
type MultipartValue =
  | string
  | number
  | boolean
  | { name: string; mimeType: string; buffer: Buffer };

interface Evidence {
  marker: string;
  sha: string;
  harnessSha: string;
  startedAt: string;
  finishedAt?: string;
  source?: { id: string; manifestId: string; aligned: boolean };
  plan?: { jobId: string; sceneCount: number; types: string[]; durationMs: number };
  generation?: { jobId: string; classroomId: string; sceneCount: number; durationMs: number };
  classroom?: {
    agentCount: number;
    speechCount: number;
    preparedInterventionAgentCount: number;
    audioDurationSeconds: number;
    imageCount: number;
    reloadedSceneCount: number;
  };
  interaction?: {
    sceneId: string;
    discussionEvents: number;
    resumeMs: number;
    nextSceneId: string;
  };
  workbook?: {
    shortCode: string;
    shortLinkStatus: number;
    contentType: string;
    qrDecoded: string;
    score: number;
    minimumCashWeek: number;
    expectedMinimumCashWeek: number;
  };
  quiz?: { questionCount: number; correctCount: number; persistedAfterReload: boolean };
  mp4?: {
    jobSceneCount: number;
    durationSeconds: number;
    expectedDurationSeconds: number;
    frameCount: number;
    width: number;
    height: number;
    hasAudio: boolean;
  };
  browser?: { consoleSignals: string[]; pageErrors: string[]; httpErrors: string[] };
  cleanup: { classroom: boolean; organization: boolean; account: boolean };
  cleanupErrors?: string[];
  error?: string;
}

function object(value: unknown, label: string): JsonObject {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function number(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function progress(message: string): void {
  console.log(`[S6-013] ${new Date().toISOString()} ${message}`);
}

async function jsonResponse(
  request: APIRequestContext,
  method: string,
  path: string,
  options: {
    data?: JsonObject;
    multipart?: Record<string, MultipartValue>;
    expected?: number[];
  } = {},
): Promise<JsonObject> {
  const response = await request.fetch(`${BASE_URL}${path}`, {
    method,
    ...(options.data === undefined ? {} : { data: options.data }),
    ...(options.multipart === undefined ? {} : { multipart: options.multipart }),
  });
  const body = await response.text();
  const expected = options.expected ?? [200];
  assert(
    expected.includes(response.status()),
    `${method} ${path} returned ${response.status()}: ${body.slice(0, 1000)}`,
  );
  return object(JSON.parse(body), `${method} ${path} response`);
}

async function pollJob(
  request: APIRequestContext,
  path: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<JsonObject> {
  const deadline = Date.now() + timeoutMs;
  let previous = '';
  while (Date.now() < deadline) {
    const payload = await jsonResponse(request, 'GET', path);
    const current = [payload.status, payload.step, payload.progress, payload.message].join(' | ');
    if (current !== previous) {
      progress(`${path}: ${current}`);
      previous = current;
    }
    if (payload.done === true) {
      assert(payload.status === 'succeeded' || payload.status === 'done', JSON.stringify(payload));
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out polling ${path}`);
}

function collectStrings(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === 'string') result.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, result));
  }
  return result;
}

function column(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function xmlNumber(xml: string, ref: string): number {
  const match = xml.match(
    new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*>[\\s\\S]*?<v>([^<]+)</v>[\\s\\S]*?</c>`),
  );
  assert(match, `Missing numeric cell ${ref}`);
  const value = Number(match[1]);
  assert(Number.isFinite(value), `Cell ${ref} is not numeric`);
  return value;
}

function replaceCell(xml: string, ref: string, innerXml: string): string {
  const pattern = new RegExp(`<c r="${ref}"([^>]*)\\s*/>|<c r="${ref}"([^>]*)>[\\s\\S]*?<\\/c>`);
  const match = xml.match(pattern);
  assert(match, `Missing writable cell ${ref}`);
  const attributes = match[1] ?? match[2] ?? '';
  return xml.replace(pattern, `<c r="${ref}"${attributes}>${innerXml}</c>`);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function completeWorkbook(source: Buffer): Promise<{
  workbook: Buffer;
  minimumCashWeek: number;
}> {
  const zip = await JSZip.loadAsync(source);
  const casePath = 'xl/worksheets/sheet2.xml';
  const forecastPath = 'xl/worksheets/sheet3.xml';
  const scenarioPath = 'xl/worksheets/sheet4.xml';
  const caseSource = await zip.file(casePath)?.async('string');
  const forecastSource = await zip.file(forecastPath)?.async('string');
  const scenarioSource = await zip.file(scenarioPath)?.async('string');
  assert(
    caseSource && forecastSource && scenarioSource,
    'Cash-flow workbook sheets are incomplete',
  );
  const caseXml: string = caseSource;
  let forecastXml: string = forecastSource;
  let scenarioXml: string = scenarioSource;

  forecastXml = replaceCell(forecastXml, 'B4', `<v>${xmlNumber(caseXml, 'B2')}</v>`);
  const rowMap = new Map([
    [5, 3],
    [6, 4],
    [8, 5],
    [9, 6],
    [10, 7],
    [11, 8],
    [12, 9],
    [13, 10],
    [17, 11],
  ]);
  for (const [forecastRow, caseRow] of rowMap) {
    for (let col = 2; col <= 14; col += 1) {
      const ref = `${column(col)}${forecastRow}`;
      forecastXml = replaceCell(
        forecastXml,
        ref,
        `<v>${xmlNumber(caseXml, `${column(col)}${caseRow}`)}</v>`,
      );
    }
  }

  const scenarioValues = [
    'Décalage de 20 % des encaissements clients de la semaine critique.',
    'Négocier un étalement fournisseur avant le premier franchissement du seuil.',
    'La décision est déclenchée par le point bas calculé et le seuil de 45 000 dirhams.',
  ];
  scenarioValues.forEach((value, index) => {
    scenarioXml = replaceCell(
      scenarioXml,
      `B${index + 1}`,
      `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`,
    );
  });
  zip.file(forecastPath, forecastXml);
  zip.file(scenarioPath, scenarioXml);

  let cash = xmlNumber(caseXml, 'B2');
  const balances: number[] = [];
  for (let col = 2; col <= 14; col += 1) {
    const receipts = xmlNumber(caseXml, `${column(col)}3`) + xmlNumber(caseXml, `${column(col)}4`);
    const outflows = [5, 6, 7, 8, 9, 10].reduce(
      (sum, row) => sum + xmlNumber(caseXml, `${column(col)}${row}`),
      0,
    );
    cash += receipts - outflows;
    balances.push(cash);
  }
  return {
    workbook: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    minimumCashWeek: balances.indexOf(Math.min(...balances)) + 1,
  };
}

async function decodeQr(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminances = grayscale({
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    colorSpace: 'srgb',
  } as ImageData);
  const detections = new Detector().detect(binarize(luminances, info.width, info.height));
  const decoder = new Decoder();
  let current = detections.next();
  while (!current.done) {
    try {
      return decoder.decode(current.value.matrix).content;
    } catch {
      current = detections.next(false);
    }
  }
  throw new Error('Unable to decode generated QR code');
}

async function mediaDuration(buffer: Buffer, suffix: string, directory: string): Promise<number> {
  const path = join(directory, `media-${crypto.randomUUID()}.${suffix}`);
  await writeFile(path, buffer);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  const duration = Number(stdout.trim());
  assert(duration > 0, `Invalid media duration for ${suffix}`);
  return duration;
}

async function login(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.goto(`${BASE_URL}/auth?next=/app`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Adresse e-mail').fill(EMAIL!);
  await page.getByLabel('Mot de passe').fill(PASSWORD!);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/app', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Connectez-vous' }).click(),
  ]);
}

async function waitForClassroom(page: Page, classroomId: string): Promise<void> {
  await page.goto(`${BASE_URL}/classroom/${classroomId}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
  const firstScene = page.locator('[data-testid="scene-item"]').first();
  await firstScene.waitFor({ state: 'attached', timeout: 30_000 });
  if (!(await firstScene.isVisible())) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  }
  await firstScene.waitFor({ state: 'visible', timeout: 30_000 });
}

async function main(): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const mediaDirectory = await mkdtemp(join(tmpdir(), `${MARKER}-media-`));
  const evidence: Evidence = {
    marker: MARKER,
    sha: SHA,
    harnessSha: HARNESS_SHA,
    startedAt: new Date().toISOString(),
    cleanup: { classroom: false, organization: false, account: false },
  };
  let classroomId: string | undefined;
  let organizationId: string | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;
  const consoleSignals: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: 'fr-FR',
      serviceWorkers: process.env.PROOF_QUIZ_ONLY === '1' ? 'block' : 'allow',
    });
    await context.addInitScript(() => {
      const records: Array<{
        src: string;
        events: Array<{
          type: string;
          at: number;
          currentTime: number;
          duration: number | null;
          readyState: number;
          networkState: number;
          paused: boolean;
          playbackRate: number;
          errorCode: number | null;
        }>;
      }> = [];
      const recordByMedia = new WeakMap<HTMLMediaElement, (typeof records)[number]>();
      const snapshot = (audio: HTMLMediaElement, type: string) => ({
        type,
        at: Date.now(),
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : null,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        playbackRate: audio.playbackRate,
        errorCode: audio.error?.code ?? null,
      });
      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        let record = recordByMedia.get(this);
        if (!record) {
          record = { src: this.currentSrc || this.src, events: [] };
          recordByMedia.set(this, record);
          records.push(record);
        }
        for (const type of [
          'loadstart',
          'loadedmetadata',
          'canplay',
          'playing',
          'waiting',
          'stalled',
          'suspend',
          'error',
          'ended',
          'pause',
          'abort',
          'emptied',
        ]) {
          if (record.events.length === 0) {
            this.addEventListener(type, () => {
              record!.src = this.currentSrc || this.src;
              record!.events.push(snapshot(this, type));
            });
          }
        }
        record.src = this.currentSrc || this.src;
        record.events.push(snapshot(this, 'play-called'));
        const result = nativePlay.call(this);
        void result.then(
          () => record!.events.push(snapshot(this, 'play-resolved')),
          () => record!.events.push(snapshot(this, 'play-rejected')),
        );
        return result;
      };
      Object.defineProperty(window, '__s6013AudioRecords', { configurable: true, value: records });
    });
    page = await context.newPage();
    const audioInstrumentationReady = await page.evaluate(async () => {
      const audio = new Audio();
      await audio.play().catch(() => undefined);
      const records = (window as typeof window & { __s6013AudioRecords?: unknown[] })
        .__s6013AudioRecords;
      const ready = records?.some((record) => JSON.stringify(record).includes('play-called'));
      if (records) records.length = 0;
      return ready;
    });
    assert(audioInstrumentationReady, 'Audio playback instrumentation is unavailable');
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        consoleSignals.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
    });
    await login(page);
    progress('Authentification temporaire réussie');
    const request = context.request;

    const organization = await jsonResponse(request, 'POST', '/api/organizations', {
      data: { name: `S6-013 ${MARKER}`, default_locale: 'fr-FR' },
      expected: [201],
    });
    organizationId = string(
      object(organization.organization, 'organization').id,
      'organization.id',
    );
    progress('Organisation temporaire créée');

    if (process.env.PROOF_QUIZ_ONLY === '1') {
      classroomId = `${MARKER}-quiz`.replace(/[^A-Za-z0-9_-]/g, '_');
      const questionText = 'Quel montant constitue le seuil de sécurité du cas ?';
      const fixture = await jsonResponse(request, 'POST', '/api/classroom', {
        data: {
          orgId: organizationId,
          stage: {
            id: classroomId,
            name: 'Preuve ciblée de transition du quiz',
            description: 'Fixture déterministe S6-013',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            language: 'fr-FR',
            style: 'professional',
          },
          scenes: [
            {
              id: `${classroomId}-intro`,
              stageId: classroomId,
              type: 'slide',
              title: 'Introduction ciblée',
              order: 0,
              content: {
                type: 'slide',
                canvas: {
                  id: `${classroomId}-canvas`,
                  viewportSize: 1000,
                  viewportRatio: 0.5625,
                  elements: [],
                  background: { type: 'solid', color: '#ffffff' },
                },
              },
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: `${classroomId}-scene`,
              stageId: classroomId,
              type: 'quiz',
              title: 'Quiz ciblé',
              order: 1,
              content: {
                type: 'quiz',
                questions: [
                  {
                    id: `${classroomId}-question`,
                    type: 'single',
                    question: questionText,
                    options: [
                      { label: '35 000 dirhams', value: 'A' },
                      { label: '45 000 dirhams', value: 'B' },
                    ],
                    answer: ['B'],
                    analysis: 'Le seuil fixé dans le cas est de 45 000 dirhams.',
                    hasAnswer: true,
                    points: 1,
                  },
                ],
              },
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
        expected: [201],
      });
      assert.equal(string(fixture.id, 'fixture.id'), classroomId);
      evidence.generation = {
        jobId: 'deterministic-quiz-fixture',
        classroomId,
        sceneCount: 2,
        durationMs: 0,
      };
      await waitForClassroom(page, classroomId);

      let releaseAuthoritativeRefresh!: () => void;
      let markAuthoritativeRefreshStarted!: () => void;
      const authoritativeRefreshReleased = new Promise<void>((resolve) => {
        releaseAuthoritativeRefresh = resolve;
      });
      const authoritativeRefreshStarted = new Promise<void>((resolve) => {
        markAuthoritativeRefreshStarted = resolve;
      });
      const classroomApiPath = `/api/classroom?id=${encodeURIComponent(classroomId)}`;
      await page.route(`**${classroomApiPath}`, async (route) => {
        markAuthoritativeRefreshStarted();
        await authoritativeRefreshReleased;
        await route.continue();
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
      await Promise.race([
        authoritativeRefreshStarted,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Authoritative classroom refresh was not intercepted')),
            10_000,
          ),
        ),
      ]);
      await page.locator('[data-testid="scene-item"]').nth(1).click();
      const startQuizButton = page.getByRole('button', { name: 'Démarrer le quiz' });
      const submitQuizButton = page.getByRole('button', { name: 'Soumettre les réponses' });
      await startQuizButton.waitFor();
      const authoritativeRefreshResponse = page.waitForResponse(
        (response) =>
          response.url().includes(classroomApiPath) && response.request().method() === 'GET',
      );
      releaseAuthoritativeRefresh();
      await authoritativeRefreshResponse;
      await startQuizButton.waitFor();
      await startQuizButton.click().catch(() => undefined);
      await page.waitForTimeout(1_000);
      await page.screenshot({
        path: join(ARTIFACT_DIR, 'quiz-transition.png'),
        fullPage: true,
      });
      await writeFile(
        join(ARTIFACT_DIR, 'quiz-transition-body.txt'),
        await page.locator('body').innerText(),
      );
      assert(await submitQuizButton.isVisible(), 'Quiz did not enter its answering phase');
      const questionGroup = page.getByRole('group', { name: questionText, exact: true });
      await questionGroup.getByRole('button').nth(1).click();
      await submitQuizButton.click();
      await page.getByText('100%', { exact: true }).waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
      await page.locator('[data-testid="scene-item"]').nth(1).click();
      const persistedAfterReload = await page.getByText('100%', { exact: true }).isVisible();
      assert(persistedAfterReload, 'Targeted quiz result did not survive reload');
      evidence.quiz = { questionCount: 1, correctCount: 1, persistedAfterReload };
      evidence.browser = { consoleSignals, pageErrors, httpErrors };
      progress('Transition et persistance ciblées du quiz certifiées');
      return;
    }

    const sourceText = [
      'DOCUMENT INTERNE AUTORISÉ — Cas fictif de formation à la trésorerie.',
      'Public : responsables de petites entreprises marocaines. Devise : MAD ; dans les textes français, écrire dirham ou dirhams.',
      'Objectif : construire une prévision glissante sur treize semaines, identifier le point bas et décider avant une rupture de trésorerie.',
      'Le classeur doit reprendre un solde initial de 125 000 dirhams et un seuil de sécurité configurable fixé à 45 000 dirhams dans ce cas.',
      'Encaissements clients S1 à S13 : 62000, 54000, 73000, 48000, 68000, 81000, 57000, 76000, 65000, 92000, 71000, 84000, 98000.',
      'Autres encaissements : 0, 12000, 0, 0, 18000, 0, 0, 10000, 0, 0, 15000, 0, 0.',
      'Fournisseurs : 37000, 42000, 51000, 39000, 47000, 56000, 44000, 53000, 46000, 58000, 49000, 55000, 61000.',
      'Salaires : 0, 0, 72000, 0, 0, 0, 72000, 0, 0, 0, 72000, 0, 0.',
      'Charges fixes : 9000 chaque semaine. Impôts : 28000 en S4 et 34000 en S9. Remboursements : 6000 chaque semaine.',
      'Autres décaissements : 4000, 3000, 5000, 4000, 6000, 3000, 4000, 5000, 3500, 4500, 4000, 5000, 6000.',
      'La formation comporte un exercice PBL : l’apprenant complète le vrai fichier, le dépose, reçoit le diagnostic Python puis justifie une décision liée au point bas calculé.',
      'L’évaluation finale comporte cinq questions à choix unique fondées uniquement sur ces données et décisions.',
      'La scène d’introduction comporte une illustration explicative originale créée pour ce cas ; aucune image du document ne doit être reprise.',
    ].join('\n');
    const sourceResponse = await jsonResponse(request, 'POST', '/api/source-library', {
      data: {
        orgId: organizationId,
        name: `source-autorisee-${MARKER}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: Buffer.byteLength(sourceText),
        parserId: 's6-013-authorized-proof',
        content: { text: sourceText, images: [] },
      },
      expected: [201],
    });
    const sourceId = string(object(sourceResponse.source, 'source').id, 'source.id');
    const manifestResponse = await jsonResponse(request, 'PUT', '/api/source-manifests', {
      data: { orgId: organizationId, sourceIds: [sourceId] },
    });
    const manifestId = string(object(manifestResponse.manifest, 'manifest').id, 'manifest.id');
    evidence.source = { id: sourceId, manifestId, aligned: false };
    progress('Source autorisée et manifeste persistés');

    const requirement = [
      'Réponds exclusivement en français impeccable.',
      'Crée exactement cinq scènes cohérentes à partir du document autorisé.',
      'Inclure une introduction au cas marocain, une scène de calcul, une scène livrant le véritable classeur Excel modifiable demandé, une scène PBL de diagnostic et un quiz final de cinq questions à choix unique.',
      'Utilise exclusivement les montants, la devise, le seuil de sécurité et les décisions décrits dans la source.',
      'Crée pour l’introduction l’illustration explicative originale demandée par la source.',
    ].join(' ');
    const generationRequest = {
      orgId: organizationId,
      sourceManifestId: manifestId,
      requirement,
      language: 'fr-FR',
      modelString: 'openai:kimi-k2.5',
      learningApproach: 'andragogy',
      interactionLevel: 'immersive',
      learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
      enableWebSearch: false,
      enableImageGeneration: true,
      imageProviderId: 'openai-image',
      imageModelId: 'gemini-3.1-flash-image',
      enableVideoGeneration: false,
      enableTTS: true,
      interactiveMode: true,
      agentMode: 'default',
      selectedPersonaIds: ['professor', 'teaching-assistant', 'analyst', 'coach'],
      teacherVoiceConfig: {
        providerId: 'higgs-tts',
        modelId: 'higgs',
        voiceId: 'younes',
        voiceName: 'Younes',
        gender: 'male',
      },
      agentVoiceOverrides: {
        'persona-professor': { providerId: 'higgs-tts', modelId: 'higgs', voiceId: 'younes' },
        'persona-teaching-assistant': {
          providerId: 'higgs-tts',
          modelId: 'higgs',
          voiceId: 'salma',
        },
        'persona-analyst': { providerId: 'higgs-tts', modelId: 'higgs', voiceId: 'khalid' },
        'persona-coach': { providerId: 'higgs-tts', modelId: 'higgs', voiceId: 'hanae' },
      },
    };

    const planStarted = Date.now();
    const planCreation = await jsonResponse(request, 'POST', '/api/generate-classroom/plan', {
      data: generationRequest,
      expected: [202],
    });
    const planJobId = string(planCreation.jobId, 'plan.jobId');
    const planJob = await pollJob(
      request,
      `/api/generate-classroom/plan/${encodeURIComponent(planJobId)}`,
      PLAN_TIMEOUT_MS,
      10_000,
    );
    const approvedPlan = object(planJob.result, 'plan.result');
    const syllabus = object(approvedPlan.syllabus, 'plan.syllabus');
    assert(array(syllabus.learningObjectives, 'syllabus.learningObjectives').length >= 2);
    const outlines = array(approvedPlan.outlines, 'plan.outlines').map((item, index) =>
      object(item, `plan.outlines[${index}]`),
    );
    assert.equal(outlines.length, 5, 'The approved plan must contain exactly five scenes');
    const outlineTypes = outlines.map((outline) => string(outline.type, 'outline.type'));
    assert(outlineTypes.includes('pbl'), 'The approved plan must contain a PBL scene');
    assert(outlineTypes.includes('quiz'), 'The approved plan must contain a quiz scene');
    assert(
      outlines.some(
        (outline) =>
          Array.isArray(outline.resourceGenerations) && outline.resourceGenerations.length > 0,
      ),
      'The approved plan must contain the real workbook request',
    );
    const finalQuizOutline = outlines.find((outline) => outline.type === 'quiz');
    assert.equal(object(finalQuizOutline?.quizConfig, 'quizConfig').questionCount, 5);
    evidence.source.aligned = true;
    evidence.plan = {
      jobId: planJobId,
      sceneCount: outlines.length,
      types: outlineTypes,
      durationMs: Date.now() - planStarted,
    };
    progress('Syllabus et plan de cinq scènes validés');

    const generationStarted = Date.now();
    const generationCreation = await jsonResponse(request, 'POST', '/api/generate-classroom', {
      data: { ...generationRequest, approvedPlan },
      expected: [202],
    });
    const generationJobId = string(generationCreation.jobId, 'generation.jobId');
    const generationJob = await pollJob(
      request,
      `/api/generate-classroom/${encodeURIComponent(generationJobId)}`,
      GENERATION_TIMEOUT_MS,
      10_000,
    );
    const generationResult = object(generationJob.result, 'generation.result');
    classroomId = string(generationResult.classroomId, 'generation.classroomId');
    assert.equal(number(generationResult.scenesCount, 'generation.scenesCount'), 5);
    evidence.generation = {
      jobId: generationJobId,
      classroomId,
      sceneCount: 5,
      durationMs: Date.now() - generationStarted,
    };
    progress('Formation complète générée et persistée');

    const classroomResponse = await jsonResponse(
      request,
      'GET',
      `/api/classroom?id=${encodeURIComponent(classroomId)}`,
    );
    const classroom = object(classroomResponse.classroom, 'classroom');
    const stage = object(classroom.stage, 'classroom.stage');
    const scenes = array(classroom.scenes, 'classroom.scenes').map((item, index) =>
      object(item, `classroom.scenes[${index}]`),
    );
    assert.equal(scenes.length, 5);
    const agents = array(stage.generatedAgentConfigs, 'stage.generatedAgentConfigs').map(
      (item, index) => object(item, `stage.generatedAgentConfigs[${index}]`),
    );
    const agentIds = new Set(agents.map((agent) => string(agent.id, 'agent.id')));
    const nonTeacherAgentIds = new Set(
      agents
        .filter((agent) => agent.role !== 'teacher')
        .map((agent) => string(agent.id, 'agent.id')),
    );
    const speechByScene = scenes.map((scene) =>
      array(scene.actions ?? [], 'scene.actions')
        .map((action, index) => object(action, `scene.action[${index}]`))
        .filter((action) => action.type === 'speech'),
    );
    const speeches = speechByScene.flat();
    assert(speeches.length > 0, 'The classroom contains no canonical speech');
    const speakingAgentIds = new Set<string>();
    const preparedInterventionAgentIds = new Set<string>();
    const sceneAudioDurations: number[] = [];
    let audioDurationSeconds = 0;
    for (const [sceneIndex, sceneSpeeches] of speechByScene.entries()) {
      let sceneDuration = 0;
      for (const speech of sceneSpeeches) {
        assert(string(speech.text, 'speech.text').trim().length > 0);
        const agentId = string(speech.agentId, 'speech.agentId');
        assert(agentIds.has(agentId), `Unknown speech agent ${agentId}`);
        speakingAgentIds.add(agentId);
        if (speech.interventionId !== undefined || speech.interventionForm !== undefined) {
          string(speech.interventionId, 'speech.interventionId');
          string(speech.interventionForm, 'speech.interventionForm');
          preparedInterventionAgentIds.add(agentId);
        }
        const audioUrl = string(speech.audioUrl, 'speech.audioUrl');
        const audioResponse = await request.get(new URL(audioUrl, BASE_URL).toString());
        assert.equal(audioResponse.status(), 200, `Audio unavailable: ${audioUrl}`);
        const audio = await audioResponse.body();
        assert(audio.length > 1024, `Audio is empty: ${audioUrl}`);
        const suffix = new URL(audioUrl, BASE_URL).pathname.split('.').pop() ?? 'wav';
        const duration = await mediaDuration(audio, suffix, mediaDirectory);
        sceneDuration += duration;
        audioDurationSeconds += duration;
      }
      sceneAudioDurations[sceneIndex] = sceneDuration || 5;
    }
    assert.deepEqual([...speakingAgentIds].sort(), [...agentIds].sort());
    assert.deepEqual(
      [...preparedInterventionAgentIds].filter((id) => nonTeacherAgentIds.has(id)).sort(),
      [...nonTeacherAgentIds].sort(),
    );

    const allStrings = collectStrings(classroom);
    const imageUrls = [...allStrings].filter((value) =>
      /^\/api\/classroom-media\/.*\.(?:png|jpe?g|webp)(?:\?|$)/i.test(value),
    );
    assert(imageUrls.length > 0, 'No generated classroom image is persisted');
    assert(
      imageUrls.some((url) => url.includes('/media/') && !url.includes('-qr.')),
      'No original generated illustration is present',
    );
    for (const imageUrl of imageUrls) {
      const imageResponse = await request.get(new URL(imageUrl, BASE_URL).toString());
      assert.equal(imageResponse.status(), 200, `Image unavailable: ${imageUrl}`);
      const image = await imageResponse.body();
      const metadata = await sharp(image).metadata();
      assert((metadata.width ?? 0) > 0 && (metadata.height ?? 0) > 0, imageUrl);
    }

    await waitForClassroom(page, classroomId);
    assert.equal(await page.locator('[data-testid="scene-item"]').count(), scenes.length);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
    const reloadedSceneCount = await page.locator('[data-testid="scene-item"]').count();
    assert.equal(reloadedSceneCount, scenes.length);
    await page.screenshot({ path: join(ARTIFACT_DIR, 'classroom-reloaded.png'), fullPage: true });
    evidence.classroom = {
      agentCount: agents.length,
      speechCount: speeches.length,
      preparedInterventionAgentCount: preparedInterventionAgentIds.size,
      audioDurationSeconds,
      imageCount: imageUrls.length,
      reloadedSceneCount,
    };
    progress('Agents, audios, images et rechargement certifiés');

    const resourcePauses = scenes.flatMap((scene) =>
      array(scene.actions ?? [], 'scene.actions')
        .map((action, index) => object(action, `scene.action[${index}]`))
        .filter((action) => action.type === 'resource_pause'),
    );
    assert.equal(resourcePauses.length, 1, 'Expected exactly one workbook checkpoint');
    const shortUrl = string(resourcePauses[0].downloadUrl, 'resource.downloadUrl');
    const shortPath = new URL(shortUrl, BASE_URL).pathname;
    assert(/^\/[A-Za-z0-9]{5}$/.test(shortPath), `Invalid short link ${shortPath}`);
    const workbookResponse = await request.get(new URL(shortUrl, BASE_URL).toString(), {
      maxRedirects: 0,
    });
    assert.equal(workbookResponse.status(), 200);
    const contentType = workbookResponse.headers()['content-type'] ?? '';
    assert(contentType.includes('spreadsheetml.sheet'), `Unexpected workbook MIME: ${contentType}`);
    assert(
      (workbookResponse.headers()['content-disposition'] ?? '').startsWith('attachment;'),
      'The short link does not trigger a file download',
    );
    const workbook = await workbookResponse.body();
    assert.equal(workbook.subarray(0, 2).toString(), 'PK');
    await writeFile(join(ARTIFACT_DIR, 'workbook-original.xlsx'), workbook);

    const qrUrl = imageUrls.find((url) => url.includes('-qr.png'));
    assert(qrUrl, 'Workbook QR image is missing');
    const qrResponse = await request.get(new URL(qrUrl, BASE_URL).toString());
    const qrBuffer = await qrResponse.body();
    const qrDecoded = await decodeQr(qrBuffer);
    assert.equal(qrDecoded, new URL(shortUrl, BASE_URL).toString());
    await writeFile(join(ARTIFACT_DIR, 'workbook-qr.png'), qrBuffer);

    const completed = await completeWorkbook(workbook);
    const completedPath = join(ARTIFACT_DIR, 'workbook-completed.xlsx');
    await writeFile(completedPath, completed.workbook);
    const assessmentResponse = await jsonResponse(
      request,
      'POST',
      '/api/pbl/v2/evaluate-workbook',
      {
        multipart: {
          workbook: {
            name: 'prevision-tresorerie-13-semaines-completee.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: completed.workbook,
          },
        },
      },
    );
    const assessment = object(assessmentResponse.assessment, 'assessment');
    assert.equal(assessment.authority, 'python-deterministic');
    assert.equal(assessment.score, 100);
    const metrics = object(assessment.metrics, 'assessment.metrics');
    assert.equal(metrics.minimumCashWeek, completed.minimumCashWeek);
    assert(
      array(assessment.checks, 'assessment.checks').every((check) => object(check, 'check').passed),
    );
    const pblScene = scenes.find((scene) => object(scene.content, 'scene.content').type === 'pbl');
    assert(pblScene, 'Generated PBL scene is missing');
    const pblContract = JSON.stringify(pblScene.content);
    assert(pblContract.includes('cash-flow-13-week') || pblContract.includes('13 semaines'));
    evidence.workbook = {
      shortCode: shortPath.slice(1),
      shortLinkStatus: workbookResponse.status(),
      contentType,
      qrDecoded,
      score: number(assessment.score, 'assessment.score'),
      minimumCashWeek: number(metrics.minimumCashWeek, 'metrics.minimumCashWeek'),
      expectedMinimumCashWeek: completed.minimumCashWeek,
    };
    progress('Lien court, QR et correction Python du classeur certifiés');

    const quizSceneIndex = scenes.findIndex(
      (scene) => object(scene.content, 'scene.content').type === 'quiz',
    );
    assert(quizSceneIndex >= 0, 'Generated quiz scene is missing');
    const quizContent = object(scenes[quizSceneIndex].content, 'quiz.content');
    const questions = array(quizContent.questions, 'quiz.questions').map((item, index) =>
      object(item, `quiz.questions[${index}]`),
    );
    assert.equal(questions.length, 5);
    assert(questions.every((question) => question.type === 'single'));
    await page.locator('[data-testid="scene-item"]').nth(quizSceneIndex).click();
    const startQuizButton = page.getByRole('button', { name: 'Démarrer le quiz' });
    const submitQuizButton = page.getByRole('button', { name: 'Soumettre les réponses' });
    await startQuizButton.waitFor();
    await page.waitForTimeout(1_000);
    try {
      await startQuizButton.click();
      await submitQuizButton.waitFor({ timeout: 10_000 });
    } catch (error) {
      await page.screenshot({
        path: join(ARTIFACT_DIR, 'quiz-transition-failed.png'),
        fullPage: true,
      });
      await writeFile(
        join(ARTIFACT_DIR, 'quiz-transition-failed-body.txt'),
        await page.locator('body').innerText(),
      );
      throw error;
    }
    for (const question of questions) {
      const questionText = string(question.question, 'quiz.question');
      const answers = array(question.answer, 'quiz.answer').map((answer) =>
        string(answer, 'answer'),
      );
      assert.equal(answers.length, 1);
      const options = array(question.options, 'quiz.options').map((item) =>
        object(item, 'quiz.option'),
      );
      const optionIndex = options.findIndex((item) => item.value === answers[0]);
      const option = options[optionIndex];
      assert(option, `Correct option ${answers[0]} is missing`);
      const label = string(option.label, 'quiz.option.label');
      const questionGroup = page.getByRole('group', { name: questionText, exact: true });
      await questionGroup.waitFor();
      const answerButton = questionGroup.getByRole('button').nth(optionIndex);
      assert(
        (await answerButton.textContent())?.includes(label),
        `Displayed option differs: ${label}`,
      );
      await answerButton.click();
    }
    await submitQuizButton.click();
    await page.getByText('100%', { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText('5 bonnes réponses', { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: join(ARTIFACT_DIR, 'quiz-100.png'), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
    await page.locator('[data-testid="scene-item"]').nth(quizSceneIndex).click();
    const persistedAfterReload = await page.getByText('100%', { exact: true }).isVisible();
    assert(persistedAfterReload, 'Quiz correction did not survive reload');
    evidence.quiz = { questionCount: 5, correctCount: 5, persistedAfterReload };
    progress('Quiz réel corrigé à 100 % et rechargé');

    const interactionSceneIndex = scenes.findIndex((scene, index) => {
      const content = object(scene.content, 'scene.content');
      const actions = array(scene.actions ?? [], 'scene.actions').map((action) =>
        object(action, 'action'),
      );
      return (
        index < scenes.length - 1 &&
        content.type === 'slide' &&
        actions.some((action) => action.type === 'speech') &&
        actions.every(
          (action) =>
            action.type === 'speech' || action.type === 'spotlight' || action.type === 'laser',
        )
      );
    });
    assert(interactionSceneIndex >= 0, 'No scene is eligible for the deepening proof');
    const interactionScene = scenes[interactionSceneIndex];
    const interactionActionTypes = array(
      interactionScene.actions ?? [],
      'interactionScene.actions',
    ).map((action) => string(object(action, 'interactionAction').type, 'interactionAction.type'));
    const interactionAudioSeconds = sceneAudioDurations[interactionSceneIndex];
    const gateTimeoutMs = Math.min(
      15 * 60_000,
      Math.max(120_000, Math.ceil((interactionAudioSeconds * 1_000) / 2) + 120_000),
    );
    await writeFile(
      join(ARTIFACT_DIR, 'interaction-selection.json'),
      JSON.stringify(
        {
          sceneId: string(interactionScene.id, 'interactionScene.id'),
          title: string(interactionScene.title, 'interactionScene.title'),
          actionTypes: interactionActionTypes,
          audioDurationSeconds: interactionAudioSeconds,
          playbackSpeed: 2,
          gateTimeoutMs,
        },
        null,
        2,
      ),
    );
    await page.locator('[data-testid="scene-item"]').nth(interactionSceneIndex).click();
    const speedButton = page.getByRole('button', { name: 'Playback speed' });
    for (let attempt = 0; attempt < 3 && (await speedButton.textContent()) !== '2x'; attempt += 1) {
      await speedButton.click();
    }
    assert.equal(await speedButton.textContent(), '2x');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const gate = page.locator('[data-scene-completion-gate="true"]');
    await gate.waitFor({ timeout: gateTimeoutMs });
    const chatResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/chat') && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'Approfondir dans la discussion' }).click();
    const chatResponse = await chatResponsePromise;
    assert.equal(chatResponse.status(), 200);
    const discussionBody = await chatResponse.text();
    const discussionEvents = (
      discussionBody.match(/"type":"(?:agent_start|text_delta|done)"/g) ?? []
    ).length;
    assert(discussionEvents >= 3, 'The deepening discussion returned no complete intervention');
    await page.getByRole('button', { name: 'Arrêter la discussion' }).first().click();
    await page
      .getByRole('button', { name: 'Arrêter la discussion' })
      .first()
      .waitFor({ state: 'hidden' });
    const resumeStarted = Date.now();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await gate.waitFor({ timeout: 5_000 });
    const resumeMs = Date.now() - resumeStarted;
    assert(resumeMs < 5_000, `Playback restarted instead of resuming its cursor (${resumeMs} ms)`);
    const nextSceneId = string(scenes[interactionSceneIndex + 1].id, 'nextScene.id');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page
      .locator('[data-testid="scene-item"]')
      .nth(interactionSceneIndex + 1)
      .getAttribute('data-state')
      .catch(() => null);
    await page
      .getByRole('heading', {
        name: string(scenes[interactionSceneIndex + 1].title, 'nextScene.title'),
      })
      .waitFor({
        timeout: 30_000,
      });
    await page.screenshot({ path: join(ARTIFACT_DIR, 'deepening-resumed.png'), fullPage: true });
    evidence.interaction = {
      sceneId: string(scenes[interactionSceneIndex].id, 'interactionScene.id'),
      discussionEvents,
      resumeMs,
      nextSceneId,
    };
    progress('Approfondissement explicite et reprise au curseur certifiés');

    await page.getByLabel('Export PPTX').click();
    const downloadPromise = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
    await page.getByTestId('export-mp4').click();
    const download = await downloadPromise;
    const mp4Path = join(ARTIFACT_DIR, 'formation-complete.mp4');
    await download.saveAs(mp4Path);
    assert((await stat(mp4Path)).size > 100_000, 'MP4 export is unexpectedly small');
    const { stdout: probeRaw } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height',
      '-of',
      'json',
      mp4Path,
    ]);
    const probe = object(JSON.parse(probeRaw), 'ffprobe');
    const streams = array(probe.streams, 'ffprobe.streams').map((item) => object(item, 'stream'));
    const video = streams.find((stream) => stream.codec_type === 'video');
    assert(video, 'MP4 has no video stream');
    const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
    assert(hasAudio, 'MP4 has no audio stream');
    const mp4Duration = Number(object(probe.format, 'ffprobe.format').duration);
    const expectedDuration = sceneAudioDurations.reduce((sum, duration) => sum + duration, 0);
    assert(
      Math.abs(mp4Duration - expectedDuration) <= Math.max(2, expectedDuration * 0.03),
      `MP4 duration ${mp4Duration}s does not cover expected ${expectedDuration}s`,
    );
    let cursor = 0;
    for (const [index, duration] of sceneAudioDurations.entries()) {
      const framePath = join(ARTIFACT_DIR, `mp4-scene-${index + 1}.png`);
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(cursor + Math.min(duration / 2, 2)),
        '-i',
        mp4Path,
        '-frames:v',
        '1',
        framePath,
      ]);
      const stats = await sharp(await readFile(framePath)).stats();
      assert(stats.entropy > 0.1, `MP4 scene ${index + 1} frame is blank`);
      cursor += duration;
    }
    evidence.mp4 = {
      jobSceneCount: scenes.length,
      durationSeconds: mp4Duration,
      expectedDurationSeconds: expectedDuration,
      frameCount: scenes.length,
      width: number(video.width, 'video.width'),
      height: number(video.height, 'video.height'),
      hasAudio,
    };
    progress('MP4 complet décodé et contrôlé scène par scène');

    evidence.browser = { consoleSignals, pageErrors, httpErrors };
    assert.deepEqual(
      consoleSignals,
      [],
      `Unexpected browser console signals: ${consoleSignals.join('\n')}`,
    );
    assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(httpErrors, [], `Unexpected HTTP errors: ${httpErrors.join('\n')}`);
  } catch (error) {
    evidence.browser = { consoleSignals, pageErrors, httpErrors };
    evidence.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
    if (page) {
      await page
        .screenshot({ path: join(ARTIFACT_DIR, 'failure.png'), fullPage: true })
        .catch(() => undefined);
      const diagnostics = await page
        .evaluate(
          () =>
            (window as typeof window & { __s6013AudioRecords?: unknown }).__s6013AudioRecords ?? [],
        )
        .catch((diagnosticError) => ({
          unavailable:
            diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
        }));
      await writeFile(
        join(ARTIFACT_DIR, 'playback-diagnostics.json'),
        JSON.stringify(diagnostics, null, 2),
      );
    }
    throw error;
  } finally {
    if (page && classroomId) {
      try {
        await jsonResponse(
          page.context().request,
          'DELETE',
          `/api/classroom?id=${encodeURIComponent(classroomId)}`,
        );
        evidence.cleanup.classroom = true;
      } catch (error) {
        evidence.cleanupErrors ??= [];
        evidence.cleanupErrors.push(error instanceof Error ? error.message : String(error));
        // The external coordinator performs a service-role fallback cleanup.
      }
    }
    if (page && organizationId) {
      try {
        await jsonResponse(
          page.context().request,
          'DELETE',
          `/api/organizations/${encodeURIComponent(organizationId)}`,
        );
        evidence.cleanup.organization = true;
      } catch (error) {
        evidence.cleanupErrors ??= [];
        evidence.cleanupErrors.push(error instanceof Error ? error.message : String(error));
        // The external coordinator performs a service-role fallback cleanup.
      }
    }
    if (page) {
      try {
        await jsonResponse(page.context().request, 'DELETE', '/api/account/delete');
        evidence.cleanup.account = true;
      } catch (error) {
        evidence.cleanupErrors ??= [];
        evidence.cleanupErrors.push(error instanceof Error ? error.message : String(error));
        // The external coordinator always removes the temporary Auth identity.
      }
    }
    evidence.finishedAt = new Date().toISOString();
    await writeFile(join(ARTIFACT_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    await browser?.close();
    await rm(mediaDirectory, { recursive: true, force: true });
    progress(`Nettoyage API : ${JSON.stringify(evidence.cleanup)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

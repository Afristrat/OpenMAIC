import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PROOF_BASE_URL ?? 'https://qalem.ma';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
const COURSE_ID = process.env.PROOF_COURSE_ID;
const CLASSROOM_ID = process.env.PROOF_CLASSROOM_ID;
const COURSE_TITLE = process.env.PROOF_COURSE_TITLE;
const ARTIFACT_DIR = process.env.PROOF_ARTIFACT_DIR;
const SHA = process.env.PROOF_APP_SHA ?? 'unknown';
const HARNESS_SHA = process.env.PROOF_HARNESS_SHA ?? 'unknown';

assert(EMAIL, 'PROOF_EMAIL is required');
assert(PASSWORD, 'PROOF_PASSWORD is required');
assert(COURSE_ID, 'PROOF_COURSE_ID is required');
assert(CLASSROOM_ID, 'PROOF_CLASSROOM_ID is required');
assert(COURSE_TITLE, 'PROOF_COURSE_TITLE is required');
assert(ARTIFACT_DIR, 'PROOF_ARTIFACT_DIR is required');

async function main(): Promise<void> {
  await mkdir(ARTIFACT_DIR!, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  const consoleSignals: string[] = [];
  const httpErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleSignals.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 500) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  const evidence = {
    appSha: SHA,
    harnessSha: HARNESS_SHA,
    startedAt: new Date().toISOString(),
    unpublishedVisible: false,
    publicationApiStatus: 0,
    publishedVisible: false,
    classroomReached: false,
    arabicRtl: false,
    consoleSignals,
    httpErrors,
    finishedAt: '',
  };

  try {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto(`${BASE_URL}/auth?next=/catalog`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Adresse e-mail').fill(EMAIL!);
    await page.getByLabel('Mot de passe').fill(PASSWORD!);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/catalog', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Connectez-vous' }).click(),
    ]);

    const title = page.getByText(COURSE_TITLE!, { exact: true });
    await title.waitFor({ state: 'visible', timeout: 30_000 });
    evidence.unpublishedVisible = true;

    const publicationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/courses/${COURSE_ID}/publication`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Publier au catalogue' }).click();
    evidence.publicationApiStatus = (await publicationResponse).status();
    assert.equal(evidence.publicationApiStatus, 200, 'Publication API must return HTTP 200');

    const classroomLink = page.locator(`a[href="/classroom/${CLASSROOM_ID}"]`);
    await classroomLink.waitFor({ state: 'visible' });
    evidence.publishedVisible = true;
    await classroomLink.click();
    await page.waitForURL((url) => url.pathname === `/classroom/${CLASSROOM_ID}`);
    await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
    await page.locator('[data-testid="scene-item"]').first().waitFor({ state: 'attached' });
    evidence.classroomReached = true;
    await page.screenshot({
      path: join(ARTIFACT_DIR!, 'catalog-to-classroom.png'),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/catalog`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'FR', exact: true }).click();
    await page.getByRole('heading', { name: 'دليل التكوينات' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    evidence.arabicRtl = true;
    assert.deepEqual(consoleSignals, [], 'Browser console errors are forbidden');
    assert.deepEqual(httpErrors, [], 'HTTP 5xx responses are forbidden');
  } finally {
    evidence.finishedAt = new Date().toISOString();
    await writeFile(join(ARTIFACT_DIR!, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

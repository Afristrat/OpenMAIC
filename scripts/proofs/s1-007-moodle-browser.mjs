import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const marker = process.env.QALEM_S1007_MARKER;
const password = process.env.QALEM_S1007_PASSWORD;
const courseModuleId = process.env.QALEM_S1007_COURSE_MODULE_ID;
const moodleBase = process.env.QALEM_S1007_MOODLE_URL ?? 'https://lms-test.qalem.ma';
assert.match(marker ?? '', /^s1007-[a-f0-9-]+$/);
assert.ok(password && password.length >= 32, 'Identifiant de recette absent');
assert.match(courseModuleId ?? '', /^\d+$/);
assert.match(moodleBase, /^(https:\/\/lms-test\.qalem\.ma|http:\/\/127\.0\.0\.1:\d+)$/);

const browser = await chromium.launch({ headless: true });
let step = 'login-page';
let completionRequest = false;
let page;
try {
  page = await browser.newPage();
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(90_000);
  page.on('request', (request) => {
    if (
      request.url().includes('/mod/scorm/datamodel.php') &&
      request.postData()?.includes('lesson_status')
    )
      completionRequest = true;
  });
  await page.goto(`${moodleBase}/login/index.php`, { waitUntil: 'commit' });
  step = 'login-credentials';
  await page.locator('#username').fill(`qalem-${marker}`);
  await page.locator('#password').fill(password);
  step = 'login-submit';
  await page.locator('#loginbtn').click();
  await page.waitForLoadState('domcontentloaded');
  assert.equal(
    await page
      .locator('.loginerrors')
      .isVisible()
      .catch(() => false),
    false,
  );
  await page.waitForLoadState('networkidle');
  step = 'activity';
  const activityResponse = await page.goto(
    `${moodleBase}/mod/scorm/view.php?id=${courseModuleId}`,
    { waitUntil: 'commit' },
  );
  assert.equal(
    activityResponse?.status(),
    200,
    `L’activité SCORM Moodle répond ${activityResponse?.status() ?? 'sans réponse'}`,
  );
  step = 'activity-launch';
  await page.locator('#scormviewform').evaluate((form) => {
    form.requestSubmit(form.querySelector('#n'));
  });
  step = 'player';
  await page.locator('#scorm_object').waitFor({ state: 'attached' });
  const sco = page.frameLocator('#scorm_object');
  await sco.locator('#scorm-complete-btn').click();
  await assert.doesNotReject(() => sco.getByText('Ce cours a été marqué comme terminé.').waitFor());
  assert.equal(completionRequest, true, 'Requête de complétion Moodle absente');
  console.log(JSON.stringify({ proof: 'S1007_MOODLE_BROWSER_OK', completionRequest: true }));
} catch (error) {
  const bodyText = page
    ? await page
        .locator('body')
        .innerText()
        .catch(() => '')
    : '';
  const cacheDiagnostic = bodyText.match(/Debug info:[\s\S]{0,500}/)?.[0];
  console.error(
    JSON.stringify({
      proof: 'S1007_MOODLE_BROWSER_FAILED',
      step,
      type: error instanceof Error ? error.name : 'unknown',
      path: page ? new URL(page.url()).pathname : null,
      loginErrorVisible: page
        ? await page
            .locator('.loginerrors')
            .isVisible()
            .catch(() => false)
        : null,
      cacheLockVisible: bodyText.includes('Unable to acquire a lock for caching'),
      cacheDiagnostic: cacheDiagnostic?.replace(/\s+/g, ' ').trim() ?? null,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}

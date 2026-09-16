import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const marker = process.env.QALEM_S1007_MARKER;
const password = process.env.QALEM_S1007_PASSWORD;
const courseModuleId = process.env.QALEM_S1007_COURSE_MODULE_ID;
assert.match(marker ?? '', /^s1007-[a-f0-9-]+$/);
assert.ok(password && password.length >= 32, 'Identifiant de recette absent');
assert.match(courseModuleId ?? '', /^\d+$/);

const browser = await chromium.launch({ headless: true });
let step = 'login';
let completionRequest = false;
try {
  const page = await browser.newPage();
  page.on('request', (request) => {
    if (request.url().includes('/mod/scorm/datamodel.php') && request.postData()?.includes('lesson_status')) completionRequest = true;
  });
  await page.goto('https://lms-test.qalem.ma/login/index.php', { waitUntil: 'commit' });
  await page.locator('#username').fill(`qalem-${marker}`);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login/index.php', { waitUntil: 'commit' }),
    page.locator('#loginbtn').click({ noWaitAfter: true }),
  ]);
  step = 'activity';
  await page.goto(`https://lms-test.qalem.ma/mod/scorm/view.php?id=${courseModuleId}`, { waitUntil: 'commit' });
  step = 'activity-launch';
  await page.locator('#n').click({ noWaitAfter: true });
  step = 'player';
  await page.locator('#scorm_object').waitFor({ state: 'attached' });
  const sco = page.frameLocator('#scorm_object');
  await sco.locator('#scorm-complete-btn').click();
  await assert.doesNotReject(() => sco.getByText('Ce cours a été marqué comme terminé.').waitFor());
  assert.equal(completionRequest, true, 'Requête de complétion Moodle absente');
  console.log(JSON.stringify({ proof: 'S1007_MOODLE_BROWSER_OK', completionRequest: true }));
} catch (error) {
  console.error(JSON.stringify({ proof: 'S1007_MOODLE_BROWSER_FAILED', step, type: error instanceof Error ? error.name : 'unknown' }));
  process.exitCode = 1;
} finally {
  await browser.close();
}

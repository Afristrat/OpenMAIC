import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const marker = process.env.QALEM_S1007_MARKER;
const password = process.env.QALEM_S1007_PASSWORD;
const scormId = process.env.QALEM_S1007_SCORM_ID;
assert.match(marker ?? '', /^s1007-[a-f0-9-]+$/);
assert.ok(password && password.length >= 32, 'Identifiant de recette absent');
assert.match(scormId ?? '', /^\d+$/);

const browser = await chromium.launch({ headless: true });
let step = 'login';
let completionRequest = false;
try {
  const page = await browser.newPage();
  page.on('request', (request) => {
    if (request.url().includes('/mod/scorm/datamodel.php') && request.postData()?.includes('lesson_status')) completionRequest = true;
  });
  await page.goto('https://lms-test.qalem.ma/login/index.php');
  await page.locator('#username').fill(`qalem-${marker}`);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login/index.php'),
    page.locator('#loginbtn').click(),
  ]);
  step = 'player';
  await page.goto(`https://lms-test.qalem.ma/mod/scorm/player.php?a=${scormId}&currentorg=&scoid=0`);
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

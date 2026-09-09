import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const learner = process.env.LTI_TEST_LEARNER;
const outage = process.env.LTI_TEST_OUTAGE === 'true';
assert.ok(learner === 'a' || learner === 'b', 'Choose the dedicated fixture learner');
assert.ok(process.env.LTI_TEST_PASSWORD?.length >= 32, 'Fixture credential missing');
const labels = JSON.parse(readFileSync('lib/i18n/locales/ui-fr-FR.json', 'utf8'));
const browser = await chromium.launch({ headless: true });
let step = 'moodle-login';
let page;
const httpErrors = [];
try {
  page = await browser.newPage({ locale: 'fr-FR' });
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  await page.goto('https://lms-test.qalem.ma/login/index.php');
  await page.locator('#username').fill(`qalem-lti-learner-${learner}`);
  await page.locator('#password').fill(process.env.LTI_TEST_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login/index.php'),
    page.locator('#loginbtn').click(),
  ]);
  step = 'lti-launch';
  await page.goto('https://lms-test.qalem.ma/mod/lti/view.php?id=2');
  await page.waitForURL('https://qalem.ma/classroom/s034-moodle-20260909', { timeout: 60000 });
  step = 'verified-context';
  const launch = await page.evaluate(async () => {
    const response = await fetch('/api/lti/context?stageId=s034-moodle-20260909');
    return { status: response.status, data: await response.json() };
  });
  assert.equal(launch.status, 200);
  assert.equal(launch.data.active, true);
  assert.equal(launch.data.gradingEnabled, true);
  if (outage) {
    step = 'await-isolated-outage';
    await writeFile('/tmp/s034-lti-outage-ready', 'ready', { flag: 'wx', mode: 0o600 });
    let allowed = false;
    for (let poll = 0; poll < 120 && !allowed; poll++) {
      allowed = await access('/tmp/s034-lti-outage-submit').then(
        () => true,
        () => false,
      );
      if (!allowed) await delay(500);
    }
    assert.ok(allowed, 'Outage coordination timed out');
  }
  step = 'answer-real-quiz';
  await page.getByRole('button', { name: labels['quiz.startQuiz'], exact: true }).click();
  await page.getByRole('button', { name: outage ? /Réponse Bêta/ : /Réponse Alpha/ }).click();
  await page
    .getByRole('button', { name: learner === 'a' ? /Réponse Delta/ : /Réponse Gamma/ })
    .click();
  const submitted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/lti/quiz' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: labels['quiz.submitAnswers'], exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 200);
  const result = await response.json();
  assert.equal(result.status, 'queued');
  assert.equal(result.score, outage ? 0 : learner === 'a' ? 25 : 100);
  step = 'reload-without-new-attempt';
  const requestId = response.request().postDataJSON().requestId;
  const replayed = page.waitForResponse(
    (reply) =>
      new URL(reply.url()).pathname === '/api/lti/quiz' && reply.request().method() === 'POST',
  );
  await page.reload();
  const replay = await replayed;
  assert.equal(replay.status(), 200);
  assert.equal(replay.request().postDataJSON().requestId, requestId);
  const replayResult = await replay.json();
  assert.equal(replayResult.deliveryId, result.deliveryId);
  assert.equal(replayResult.score, result.score);
  console.log(
    JSON.stringify({
      proof: 'S034_REAL_MOODLE_QUIZ_QUEUED',
      learner,
      score: result.score,
      deliveryId: result.deliveryId,
      sameDeliveryAfterReload: true,
      httpErrors,
    }),
  );
} catch (error) {
  // Never emit filled credentials, cookies, signed launch bodies or full URLs.
  console.error(
    JSON.stringify({
      proof: 'S034_REAL_MOODLE_QUIZ_FAILED',
      step,
      type: error?.name,
      path: page ? new URL(page.url()).pathname : null,
      httpErrors,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}

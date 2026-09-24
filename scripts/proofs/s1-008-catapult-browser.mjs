import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const launchUrl = process.env.QALEM_S1008_LAUNCH_URL;
assert.match(launchUrl ?? '', /^http:\/\/s1008-player:3398\/content\//);

const browser = await chromium.launch({ headless: true });
const statements = [];
const failures = [];

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      failures.push(`console:${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`page:${error.message}`));
  page.on('response', (response) => {
    const expectedEmptyLearnerProfile =
      response.status() === 404 &&
      response.url().includes('/lrs/agents/profile?profileId=cmi5LearnerPreferences');
    if (response.status() >= 400 && !expectedEmptyLearnerProfile) {
      failures.push(`http:${response.status()}:${response.url()}`);
    }
  });
  page.on('request', (request) => {
    if (request.method() !== 'PUT' || !request.url().includes('/lrs/statements')) return;
    const payload = request.postDataJSON();
    statements.push({
      id: payload.id,
      queryId: new URL(request.url()).searchParams.get('statementId'),
      verb: payload.verb?.id,
      completion: payload.result?.completion ?? null,
      progress:
        payload.result?.extensions?.['https://w3id.org/xapi/cmi5/result/extensions/progress'] ??
        null,
    });
  });

  await page.goto(launchUrl, { waitUntil: 'networkidle' });
  await page.locator('#scorm-complete-btn').click();
  await page.getByText('Ce cours a été marqué comme terminé.').waitFor();
  await page.waitForTimeout(500);

  const verbs = statements.map(({ verb }) => verb?.split('/').at(-1));
  assert.deepEqual(verbs, ['initialized', 'completed', 'terminated']);
  assert.ok(statements.every(({ id, queryId }) => id && id === queryId));
  assert.deepEqual(
    statements.map(({ completion, progress }) => ({ completion, progress })),
    [
      { completion: null, progress: null },
      { completion: true, progress: 1 },
      { completion: null, progress: null },
    ],
  );
  assert.deepEqual(failures, []);
  console.log(
    JSON.stringify({
      proof: 'S1008_CATAPULT_BROWSER_OK',
      verbs,
      statementIdsMatched: true,
      completion: true,
      progress: 1,
    }),
  );
} finally {
  await browser.close();
}

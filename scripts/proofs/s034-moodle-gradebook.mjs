import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

assert.ok(process.env.QALEM_MOODLE_ADMIN_PASSWORD?.length >= 32);
const expectedA = Number(process.env.LTI_EXPECT_A ?? 25);
assert.ok([0, 25].includes(expectedA));
const browser = await chromium.launch({ headless: true });
let step = 'login';
try {
  const page = await browser.newPage();
  await page.goto('https://lms-test.qalem.ma/login/index.php');
  await page.locator('#username').fill('qalem-lti-admin');
  await page.locator('#password').fill(process.env.QALEM_MOODLE_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login/index.php'),
    page.locator('#loginbtn').click(),
  ]);
  step = 'real-gradebook';
  await page.goto('https://lms-test.qalem.ma/grade/report/grader/index.php?id=2');
  const table = page.locator('#user-grades');
  const rows = {};
  for (const [suffix, expected] of [
    ['A', expectedA],
    ['B', 100],
  ]) {
    const row = table.locator('tr').filter({ hasText: `Recette ${suffix}` });
    assert.equal(await row.count(), 1);
    const text = await row.innerText();
    assert.match(text, new RegExp(`(?:^|\\s)${expected}[.,]00(?:\\s|$)`));
    rows[suffix] = text;
  }
  console.log(JSON.stringify({ proof: 'S034_REAL_MOODLE_GRADEBOOK_OK', rows }));
} catch (error) {
  // Do not print action logs containing credentials or authentication URLs.
  console.error(
    JSON.stringify({ proof: 'S034_REAL_MOODLE_GRADEBOOK_FAILED', step, type: error?.name }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}

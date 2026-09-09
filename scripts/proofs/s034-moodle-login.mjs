import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const password = process.env.QALEM_MOODLE_ADMIN_PASSWORD;
assert.ok(password?.length >= 32, 'Moodle credential missing');
const browser = await chromium.launch({ headless: true });
let step = 'login-page';
try {
  const page = await browser.newPage();
  await page.goto('https://lms-test.qalem.ma/login/index.php');
  assert.equal(await page.locator('a[href*="/login/signup.php"]').count(), 0);
  step = 'authenticate';
  await page.locator('#username').fill('qalem-lti-admin');
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/login/index.php'),
    page.locator('#loginbtn').click(),
  ]);
  step = 'administration';
  await page.goto('https://lms-test.qalem.ma/admin/search.php');
  assert.equal(new URL(page.url()).pathname, '/admin/search.php');
  await page.locator('#user-menu-toggle').waitFor({ state: 'visible' });
  console.log(JSON.stringify({ proof: 'S034_MOODLE_LOGIN_OK', signup: false, admin: true }));
} catch (error) {
  // No Playwright action logs: they may contain filled credentials or session URLs.
  console.error(JSON.stringify({ proof: 'S034_MOODLE_LOGIN_FAILED', step, type: error?.name }));
  process.exitCode = 1;
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { supabaseUrl, serviceKey, baseUrl = 'https://qalem.ma' } = JSON.parse(input);
input = '';
assert.equal(new URL(baseUrl).origin, 'https://qalem.ma');
assert.equal(new URL(supabaseUrl).origin, 'https://db.qalem.ma');

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, authOptions);
const client = createClient(supabaseUrl, serviceKey, authOptions);
const labels = JSON.parse(
  await readFile(new URL('../../lib/i18n/locales/ui-fr-FR.json', import.meta.url), 'utf8'),
);
const email = `qalem-u021-${randomUUID()}@example.invalid`;
let userId;
let session;
let browser;
let complete = false;

try {
  const anonymous = await fetch(`${baseUrl}/api/telemetry-consent`);
  assert.equal(anonymous.status, 401, 'Anonymous analytics state must stay private');

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  assert.ok(!created.error && created.data.user, 'Unable to create temporary proof user');
  userId = created.data.user.id;

  const provisioned = await admin
    .from('telemetry_consent')
    .select('pedagogy_consent,xapi_consent,collection_epoch')
    .eq('user_id', userId)
    .single();
  assert.ok(!provisioned.error, 'Contractual analytics were not provisioned');
  assert.equal(provisioned.data.pedagogy_consent, true);
  assert.equal(provisioned.data.xapi_consent, false);

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(!link.error && link.data.properties?.hashed_token, 'Private login link unavailable');
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  session = login.data.session;
  assert.ok(!login.error && session, 'Unable to authenticate temporary proof user');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const parts = encoded.match(/.{1,3180}/g);
  await context.addCookies(
    parts.map((value, index) => ({
      name: parts.length === 1 ? storageKey : `${storageKey}.${index}`,
      value,
      domain: new URL(baseUrl).hostname,
      path: '/',
      secure: true,
      sameSite: 'Lax',
    })),
  );

  const analytics = await context.request.get(`${baseUrl}/api/telemetry-consent`);
  assert.equal(analytics.status(), 200);
  assert.match(analytics.headers()['cache-control'] ?? '', /private.*no-store/);
  const analyticsState = await analytics.json();
  assert.equal(analyticsState.choice, true);
  assert.equal(analyticsState.hasConsent, true);
  assert.match(analyticsState.epoch, /^[0-9a-f-]{36}$/);

  const xapi = await context.request.get(`${baseUrl}/api/telemetry-consent?purpose=xapi`);
  assert.equal(xapi.status(), 200);
  assert.deepEqual(await xapi.json(), { choice: false, hasConsent: false });

  const immutable = await context.request.post(`${baseUrl}/api/telemetry-consent`, {
    headers: { origin: baseUrl },
    data: { consent: false },
  });
  assert.equal(immutable.status(), 400, 'Internal analytics must not be user-configurable');

  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.goto(`${baseUrl}/app`, { timeout: 60_000 });
  await expect(page.getByRole('region', { name: labels['telemetry.xapiTitle'] })).toHaveCount(0);

  await page.goto(`${baseUrl}/profile`, { timeout: 60_000 });
  const control = page.getByRole('region', { name: labels['telemetry.xapiTitle'] });
  await expect(control).toBeVisible();
  await expect(control.getByRole('button', { name: labels['telemetry.xapiAccept'] })).toBeEnabled();

  const enabledResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/telemetry-consent' &&
      response.request().method() === 'POST',
  );
  await control.getByRole('button', { name: labels['telemetry.xapiAccept'] }).click();
  assert.equal((await enabledResponse).status(), 200);
  await expect(control.getByText(labels['telemetry.xapiEnabled'], { exact: true })).toBeVisible();
  const enabled = await admin
    .from('telemetry_consent')
    .select('pedagogy_consent,xapi_consent,collection_epoch')
    .eq('user_id', userId)
    .single();
  assert.ok(!enabled.error);
  assert.equal(enabled.data.pedagogy_consent, true);
  assert.equal(enabled.data.xapi_consent, true);
  assert.notEqual(enabled.data.collection_epoch, analyticsState.epoch);

  const disabledResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/telemetry-consent' &&
      response.request().method() === 'POST',
  );
  await control.getByRole('button', { name: labels['telemetry.withdraw'] }).click();
  assert.equal((await disabledResponse).status(), 200);
  await expect(control.getByText(labels['telemetry.xapiDisabled'], { exact: true })).toBeVisible();
  const disabled = await admin
    .from('telemetry_consent')
    .select('pedagogy_consent,xapi_consent,collection_epoch')
    .eq('user_id', userId)
    .single();
  assert.ok(!disabled.error);
  assert.equal(disabled.data.pedagogy_consent, true);
  assert.equal(disabled.data.xapi_consent, false);
  assert.notEqual(disabled.data.collection_epoch, enabled.data.collection_epoch);
  complete = true;
} finally {
  await browser?.close();
  if (session) await client.auth.signOut({ scope: 'local' });
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    assert.ok(!removed.error, 'Temporary proof user cleanup failed');
    const remaining = await admin
      .from('telemetry_consent')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    assert.ok(!remaining.error && remaining.count === 0, 'Temporary analytics row remains');
  }
}

assert.ok(complete);
console.log(
  JSON.stringify({
    contractualAnalytics: true,
    internalChoiceImmutable: true,
    xapiDefault: false,
    xapiProfileOnly: true,
    xapiEnableDisable: true,
    epochRotated: true,
    temporaryFixturesDeleted: true,
  }),
);

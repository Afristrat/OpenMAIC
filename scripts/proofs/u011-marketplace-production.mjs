import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

// Private stdin only. No session file, mail, recording, or user-owned publication.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { supabaseUrl, serviceKey, baseUrl = 'https://qalem.ma' } = JSON.parse(input);
input = '';
assert.equal(new URL(baseUrl).origin, 'https://qalem.ma');
assert.equal(new URL(supabaseUrl).origin, 'https://db.qalem.ma');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, options);
const client = createClient(supabaseUrl, serviceKey, options);
const labels = JSON.parse(
  await readFile(new URL('../../lib/i18n/locales/ui-fr-FR.json', import.meta.url), 'utf8'),
);
const orgId = randomUUID();
const foreignOrgId = randomUUID();
const email = `qalem-u011-${randomUUID()}@example.invalid`;
const createdOrgs = [];
let userId;
let session;
let browser;
let snapshotId;
let complete = false;
const configuration = {
  name: 'Recette U-011 — agent temporaire',
  role: 'student',
  persona: 'Analyse une situation professionnelle.',
  avatar: '/avatars/teacher-2.png',
  color: '#112233',
  priority: 9,
  allowedActions: ['wb_open'],
  gender: 'female',
  interactionWeight: 37,
  voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
};
try {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  assert.ok(!created.error && created.data.user, 'Unable to create temporary proof user');
  userId = created.data.user.id;
  for (const id of [orgId, foreignOrgId]) {
    const result = await admin.from('organizations').insert({ id, name: `U011 proof ${id}` });
    assert.ok(!result.error, 'Unable to create temporary proof tenant');
    createdOrgs.push(id);
  }
  const membership = await admin
    .from('org_members')
    .insert({ user_id: userId, org_id: orgId, role: 'author' });
  assert.ok(!membership.error, 'Unable to create proof author membership');
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(
    !link.error && link.data.properties?.hashed_token,
    'Unable to create private login link',
  );
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  session = login.data.session;
  assert.ok(!login.error && session, 'Unable to authenticate proof user');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const parts = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`.match(
    /.{1,3180}/g,
  );
  await context.addCookies(
    parts.map((value, index) => ({
      name: parts.length === 1 ? key : `${key}.${index}`,
      value,
      domain: 'qalem.ma',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    })),
  );
  const page = await context.newPage();
  await page.addInitScript((agent) => {
    localStorage.setItem('locale', 'fr-FR');
    localStorage.setItem(
      'agent-registry-storage',
      JSON.stringify({
        version: 11,
        state: {
          agents: {
            'u011-local': {
              ...agent,
              id: 'u011-local',
              isDefault: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        },
      }),
    );
  }, configuration);
  const foreign = await context.request.post(`${baseUrl}/api/marketplace/agents/drafts`, {
    data: { orgId: foreignOrgId, requestId: randomUUID(), agent: configuration },
  });
  assert.equal(foreign.status(), 403, 'Foreign tenant must be denied');
  await page.goto(`${baseUrl}/marketplace/agents`, { timeout: 60_000 });
  await page
    .getByRole('combobox', { name: labels['marketplace.publicationOrg'], exact: true })
    .selectOption(orgId);
  await page
    .getByRole('combobox', { name: labels['marketplace.localAgent'], exact: true })
    .selectOption('u011-local');
  const before = await admin
    .from('agent_configs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);
  assert.ok(!before.error && before.count === 0, 'No publication before confirmation');
  await page.getByRole('button', { name: labels['marketplace.publish'], exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(labels['marketplace.publicDescription'], { exact: true })
    .fill('Recette temporaire automatisée U-011.');
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/marketplace/agents/drafts' &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: labels['marketplace.submitPublish'] }).click();
  const draftResponse = await saved;
  assert.equal(draftResponse.status(), 200, 'Real draft request failed');
  snapshotId = (await draftResponse.json()).agentId;
  assert.ok(typeof snapshotId === 'string', 'Draft identity missing');
  const owned = page.getByRole('region', { name: labels['marketplace.ownedTitle'] });
  const publishedLabel = `${configuration.name} — ${labels['marketplace.published']}`;
  const privateLabel = `${configuration.name} — ${labels['marketplace.privateAgent']}`;
  await expect(owned.getByText(publishedLabel, { exact: true })).toBeVisible();
  await page.reload();
  await expect(owned.getByText(publishedLabel, { exact: true })).toBeVisible();
  const details = await context.request.get(`${baseUrl}/api/marketplace/agents/${snapshotId}`);
  assert.equal(details.status(), 200, 'Published profile unavailable');
  const body = await details.json();
  assert.deepEqual(body.agent.configuration, configuration, 'Published profile changed');
  await owned.getByRole('button', { name: labels['marketplace.withdraw'], exact: true }).click();
  await expect(owned.getByText(privateLabel, { exact: true })).toBeVisible();
  assert.equal(
    (await context.request.get(`${baseUrl}/api/marketplace/agents/${snapshotId}`)).status(),
    404,
  );
  await page.reload();
  await expect(owned.getByText(privateLabel, { exact: true })).toBeVisible();
  await owned.getByRole('button', { name: labels['marketplace.publish'], exact: true }).click();
  await expect(owned.getByText(publishedLabel, { exact: true })).toBeVisible();
  const rows = await admin
    .from('agent_configs')
    .select('id,is_published,org_id')
    .eq('owner_id', userId);
  assert.ok(
    !rows.error &&
      rows.data.length === 1 &&
      rows.data[0].id === snapshotId &&
      rows.data[0].is_published &&
      rows.data[0].org_id === orgId,
    'Republication must reuse exactly one tenant snapshot',
  );
  complete = true;
} finally {
  const cleanupErrors = [];
  if (session) {
    try {
      const logout = await client.auth.signOut({ scope: 'local' });
      const refresh = await client.auth.refreshSession({ refresh_token: session.refresh_token });
      if (logout.error || !refresh.error || refresh.data.session)
        cleanupErrors.push('session revocation');
    } catch {
      cleanupErrors.push('session revocation');
    }
  }
  await browser?.close();
  if (userId) {
    const removed = await admin.from('agent_configs').delete().eq('owner_id', userId);
    if (removed.error) cleanupErrors.push('agent cleanup');
  }
  for (const id of createdOrgs) {
    const removed = await admin.from('organizations').delete().eq('id', id);
    if (removed.error) cleanupErrors.push('tenant cleanup');
  }
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) cleanupErrors.push('user cleanup');
  }
  assert.deepEqual(cleanupErrors, [], 'Temporary fixture cleanup failed');
}
assert.ok(complete);
console.log(
  JSON.stringify({
    publication: true,
    withdrawal: true,
    reload: true,
    republication: true,
    foreignTenantStatus: 403,
    temporaryFixturesDeleted: true,
    sessionFileCreated: false,
  }),
);

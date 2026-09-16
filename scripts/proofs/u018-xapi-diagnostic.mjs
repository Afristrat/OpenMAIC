import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { supabaseUrl, serviceKey, adminEmail } = JSON.parse(input);
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
let browser;
let session;
try {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminEmail });
  assert.ok(link.data.properties?.hashed_token, 'Magic link unavailable');
  const login = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  session = login.data.session;
  assert.ok(session, 'Login failed');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  await context.addCookies([
    {
      name: key,
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'qalem.ma',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const status = await page.goto('https://qalem.ma/api/xapi/status');
  const state = await status.json();
  assert.equal(status.status(), 200);
  assert.equal(state.configured, true);
  assert.equal(state.emissionEnabled, false);
  const test = await page.request.post('https://qalem.ma/api/xapi/test', {
    headers: { origin: 'https://qalem.ma' },
  });
  const result = await test.json();
  assert.equal(test.status(), 200);
  assert.equal(result.connectionVerified, true);
  assert.equal(result.writeVerified, false);
  console.log('u018=authenticated-lrs-diagnostic-ok');
} finally {
  await client.auth.signOut({ scope: 'local' });
  await browser?.close();
}

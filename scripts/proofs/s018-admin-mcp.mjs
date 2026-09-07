import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

// Credentials arrive through a private stdin pipe, never command arguments or files.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { supabaseUrl, serviceKey, adminEmail, baseUrl = 'https://qalem.ma' } = JSON.parse(input);
input = '';
assert.equal(new URL(baseUrl).hostname, 'qalem.ma', 'Unexpected proof target');
assert.ok(supabaseUrl && serviceKey && adminEmail, 'Proof configuration required');
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, authOptions);
const client = createClient(supabaseUrl, serviceKey, authOptions);
let browser;
let session;
let result;
try {
  // Never let generateLink create an account implicitly: verify it already exists.
  let existing = false;
  for (let page = 1; page <= 100; page++) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 100 });
    assert.ok(!users.error, 'Unable to verify existing administrator');
    existing = users.data.users.some((user) => user.email === adminEmail);
    if (existing || users.data.users.length < 100) break;
  }
  assert.ok(existing, 'Configured administrator does not exist');
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminEmail });
  assert.ok(!link.error && link.data.properties?.hashed_token, 'Proof login link unavailable');
  const login = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  session = login.data.session;
  assert.ok(!login.error && session, 'Proof login failed');

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
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/api/admin/mcp`, { timeout: 60_000 });
  assert.equal(response.status(), 200, 'Authenticated MCP health must succeed');
  const body = await response.json();
  assert.equal(body.success, true, 'MCP health result must be successful');
  assert.ok(Array.isArray(body.servers), 'MCP registry must be an array');
  for (const server of body.servers) {
    assert.ok(
      Object.keys(server).every((key) =>
        ['id', 'name', 'status', 'toolCount', 'errorMessage'].includes(key),
      ),
      'MCP health must expose only public metadata',
    );
  }
  assert.equal(response.headers()['cache-control'], 'no-store, max-age=0');
  result = { authenticatedStatus: response.status(), serverCount: body.servers.length };
} finally {
  try {
    if (session) {
      const logout = await client.auth.signOut({ scope: 'local' });
      assert.ok(!logout.error, 'Temporary proof session revocation failed');
      const refresh = await client.auth.refreshSession({ refresh_token: session.refresh_token });
      assert.ok(refresh.error && !refresh.data.session, 'Proof refresh token must be revoked');
    }
  } finally {
    await browser?.close();
  }
}
console.log(JSON.stringify({ ...result, proofSessionRevoked: true, sessionFileCreated: false }));

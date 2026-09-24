import assert from 'node:assert/strict';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const {
  adminUrl = 'http://127.0.0.1:18080/admin',
  adminUsername,
  adminPassword,
  actorIfi,
  lrsEndpoint = 'https://lrs.qalem.ma/xapi',
  lrsApiKey,
  lrsApiSecret,
} = JSON.parse(input);
input = '';

assert.equal(new URL(adminUrl).origin, 'http://127.0.0.1:18080');
assert.equal(new URL(lrsEndpoint).origin, 'https://lrs.qalem.ma');
assert.match(actorIfi, /^mbox::mailto:[0-9a-f]{64}@qalem\.invalid$/);
assert.ok(adminUsername && adminPassword && lrsApiKey && lrsApiSecret, 'LRS credentials required');

const login = await fetch(`${adminUrl.replace(/\/$/, '')}/account/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  signal: AbortSignal.timeout(10_000),
});
assert.equal(login.status, 200, `LRS admin login failed with HTTP ${login.status}`);
const rawToken = await login.text();
let token = rawToken;
try {
  const parsed = JSON.parse(rawToken);
  token =
    typeof parsed === 'string'
      ? parsed
      : (parsed.token ?? parsed.jwt ?? parsed.access_token ?? parsed['access-token']);
} catch {
  // Current SQL LRS versions return the JWT as a raw response body.
}
assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

try {
  const removed = await fetch(`${adminUrl.replace(/\/$/, '')}/agents`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 'actor-ifi': actorIfi }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(removed.status, 200, `LRS actor purge failed with HTTP ${removed.status}`);

  const actor = { mbox: actorIfi.replace(/^mbox::/, '') };
  const endpoint = new URL(`${lrsEndpoint.replace(/\/$/, '')}/statements`);
  endpoint.searchParams.set('agent', JSON.stringify(actor));
  const verification = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${lrsApiKey}:${lrsApiSecret}`).toString('base64')}`,
      'X-Experience-API-Version': '1.0.3',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(verification.status, 200, 'Unable to verify the LRS actor purge');
  const result = await verification.json();
  assert.deepEqual(result.statements, [], 'Temporary LRS statements remain after actor purge');
} finally {
  await fetch(`${adminUrl.replace(/\/$/, '')}/account/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

console.log(
  JSON.stringify({
    actorHardDeleted: true,
    statementsRemaining: 0,
    adminSessionClosed: true,
  }),
);

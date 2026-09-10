// Run only inside the Qalem worker, using its injected environment. No credentials
// or response payloads are printed. Creates and removes one synthetic Auth user.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';

assert(process.argv.includes('--execute-qalem-auth-proof'), 'Explicit execution flag required');
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert(base && service && anon, 'Qalem Auth environment missing');
const email = `s036-auth-proof-${randomUUID()}@example.invalid`;
const password = randomBytes(32).toString('base64url');
let createdId;
let deleted = false;
async function call(path, { method = 'GET', body, token = service, key = service } = {}) {
  const response = await fetch(`${base}/auth/v1${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
try {
  const created = await call('/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true },
  });
  assert.equal(created.status, 200, 'Synthetic account creation failed');
  const user = created.data?.user ?? created.data;
  assert.match(user?.id ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(user.email, email, 'Unexpected account returned');
  createdId = user.id;
  console.log(JSON.stringify({ step: 'created', fixtureId: createdId }));
  const signedIn = await call('/token?grant_type=password', {
    method: 'POST',
    key: anon,
    token: anon,
    body: { email, password },
  });
  assert.equal(signedIn.status, 200, 'Synthetic sign-in failed');
  assert(signedIn.data?.access_token && signedIn.data?.refresh_token, 'Session missing');
  const before = await call('/user', { key: anon, token: signedIn.data.access_token });
  assert.equal(before.status, 200, 'Session verification failed');
  const removed = await call(`/admin/users/${createdId}`, {
    method: 'DELETE',
    body: { should_soft_delete: false },
  });
  assert.equal(removed.status, 200, 'Synthetic account deletion failed');
  deleted = true;
  const after = await call('/user', { key: anon, token: signedIn.data.access_token });
  const refresh = await call('/token?grant_type=refresh_token', {
    method: 'POST',
    key: anon,
    token: anon,
    body: { refresh_token: signedIn.data.refresh_token },
  });
  const lookup = await call(`/admin/users/${createdId}`);
  assert.equal(after.status, 403, 'Deleted user still verified or unexpected Auth response');
  assert.equal(refresh.status, 400, 'Deleted session still refreshes or unexpected Auth response');
  assert.equal(lookup.status, 404, 'Deleted account still found');
  console.log(
    JSON.stringify({
      step: 'verified',
      deletion: removed.status,
      oldTokenAuthUser: after.status,
      refresh: refresh.status,
      adminLookup: lookup.status,
    }),
  );
} finally {
  if (createdId && !deleted) {
    const cleanup = await call(`/admin/users/${createdId}`, {
      method: 'DELETE',
      body: { should_soft_delete: false },
    });
    assert([200, 404].includes(cleanup.status), 'Synthetic fixture cleanup requires attention');
    console.log(JSON.stringify({ step: 'cleanup', status: cleanup.status, fixtureId: createdId }));
  }
}

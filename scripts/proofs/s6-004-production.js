import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anon && service, 'Missing required runtime configuration');

const marker = `s6004-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const createdUsers = [];
let stage = 'initialisation';

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Status is still useful; no response body is emitted by this proof.
  }
  return { status: response.status, payload };
}

async function createUser(label) {
  stage = `creation-compte-${label}`;
  const email = `${marker}-${label}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const created = await json(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200);
  const id = created.payload?.id;
  assert(typeof id === 'string' && id.length > 0);
  createdUsers.push(id);

  const signed = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  stage = `connexion-compte-${label}`;
  assert.equal(signed.status, 200);
  assert(typeof signed.payload?.access_token === 'string');
  assert(typeof signed.payload?.refresh_token === 'string');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const sessionCookie = `sb-${projectRef}-auth-token=base64-${Buffer.from(
    JSON.stringify(signed.payload),
  ).toString('base64url')}`;
  return {
    userId: id,
    header: () => sessionCookie,
  };
}

async function call(session, path, method = 'GET', data) {
  return json(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      cookie: session.header(),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}

async function createOrganization(userId, label) {
  const result = await json(`${supabaseUrl}/rest/v1/organizations`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `S6-004 ${marker} ${label}`,
      default_locale: 'fr-FR',
      status: 'active',
      seat_limit: 1,
    }),
  });
  assert.equal(result.status, 201);
  const id = result.payload?.[0]?.id;
  assert(typeof id === 'string' && id.length > 0);
  const membership = await json(`${supabaseUrl}/rest/v1/org_members`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Prefer: 'return=minimal',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, org_id: id, role: 'admin' }),
  });
  assert.equal(membership.status, 201);
  return id;
}

async function removeOrganization(id) {
  const result = await json(`${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: service, Authorization: `Bearer ${service}`, Prefer: 'return=minimal' },
  });
  assert([200, 204].includes(result.status));
}

async function deleteUser(id) {
  const result = await json(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  assert([200, 204, 404].includes(result.status));
}

async function main() {
  const summary = {
    created: 0,
    duplicateStatus: 0,
    emptyStatus: 0,
    manifestVersions: [],
    crossTenantStatuses: [],
    cleanup: [],
  };
  let firstSession;
  let secondSession;
  let firstOrganization;
  let secondOrganization;
  try {
    stage = 'compte-a';
    firstSession = await createUser('a');
    stage = 'compte-b';
    secondSession = await createUser('b');
    stage = 'organisation-a';
    firstOrganization = await createOrganization(firstSession.userId, 'A');
    stage = 'organisation-b';
    secondOrganization = await createOrganization(secondSession.userId, 'B');
    const texts = [
      'Document autorisé A : autonomie de décision et application professionnelle.',
      'Document autorisé B : l’expérience nourrit l’apprentissage adulte.',
      'Document autorisé C : les références et contradictions restent explicites.',
    ];
    const sourceIds = [];
    for (let index = 0; index < texts.length; index += 1) {
      const result = await call(firstSession, '/api/source-library', 'POST', {
        orgId: firstOrganization,
        name: `${marker}-${index}.txt`,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(texts[index]),
        parserId: 's6004-production',
        content: { text: texts[index], images: [] },
      });
      assert.equal(result.status, 201);
      sourceIds.push(result.payload?.source?.id);
      summary.created += 1;
    }
    assert(sourceIds.every((id) => typeof id === 'string'));
    const duplicate = await call(firstSession, '/api/source-library', 'POST', {
      orgId: firstOrganization,
      name: `${marker}-0.txt`,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(texts[0]),
      parserId: 's6004-production',
      content: { text: texts[0], images: [] },
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.payload?.source?.id, sourceIds[0]);
    summary.duplicateStatus = duplicate.status;
    const empty = await call(firstSession, '/api/source-library', 'POST', {
      orgId: firstOrganization,
      name: `${marker}-empty.txt`,
      mimeType: 'text/plain',
      sizeBytes: 1,
      parserId: 's6004-production',
      content: { text: ' ', images: [] },
    });
    assert.equal(empty.status, 422);
    summary.emptyStatus = empty.status;
    const firstManifest = await call(firstSession, '/api/source-manifests', 'PUT', {
      orgId: firstOrganization,
      sourceIds,
    });
    assert.equal(firstManifest.status, 200);
    assert.equal(firstManifest.payload?.manifest?.version, 1);
    summary.manifestVersions.push(firstManifest.payload.manifest.version);
    const list = await call(
      firstSession,
      `/api/source-library?orgId=${encodeURIComponent(firstOrganization)}`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.payload?.sources?.length, 3);
    const replacement = await call(firstSession, '/api/source-manifests', 'PUT', {
      orgId: firstOrganization,
      sourceIds: [sourceIds[0], sourceIds[2]],
      expectedVersion: 1,
    });
    assert.equal(replacement.status, 200);
    assert.equal(replacement.payload?.manifest?.version, 2);
    summary.manifestVersions.push(replacement.payload.manifest.version);
    const reuse = await call(firstSession, '/api/source-manifests', 'PUT', {
      orgId: firstOrganization,
      sourceIds,
      expectedVersion: 2,
    });
    assert.equal(reuse.status, 200);
    assert.equal(reuse.payload?.manifest?.version, 3);
    summary.manifestVersions.push(reuse.payload.manifest.version);
    const crossList = await call(
      secondSession,
      `/api/source-library?orgId=${encodeURIComponent(firstOrganization)}`,
    );
    const crossWrite = await call(secondSession, '/api/source-manifests', 'PUT', {
      orgId: firstOrganization,
      sourceIds,
    });
    assert.equal(crossList.status, 403);
    assert.equal(crossWrite.status, 403);
    summary.crossTenantStatuses = [crossList.status, crossWrite.status];
    await removeOrganization(firstOrganization);
    firstOrganization = undefined;
    summary.cleanup.push('orgA');
    await removeOrganization(secondOrganization);
    secondOrganization = undefined;
    summary.cleanup.push('orgB');
    for (const id of createdUsers.splice(0)) {
      await deleteUser(id);
      summary.cleanup.push('user');
    }
    console.log(JSON.stringify(summary));
  } finally {
    if (firstOrganization) await removeOrganization(firstOrganization);
    if (secondOrganization) await removeOrganization(secondOrganization);
    for (const id of createdUsers.splice(0)) await deleteUser(id);
  }
}

main().catch((error) => {
  console.error(`${stage}:${error instanceof Error ? error.name : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const base = 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const controlledClient = process.env.QALEM_LOCAL_PROOF_BIN;
assert(
  supabaseUrl && anon && service && controlledClient,
  'Missing required runtime configuration',
);

const marker = `s2012-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const createdUsers = [];
let organizationId;
let packageId;
let stage = 'initialisation';

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // The proof records statuses only; no response body is exposed on failure.
  }
  return {
    status: response.status,
    payload,
    bytes: Buffer.from(text),
    contentType: response.headers.get('content-type'),
    contentDisposition: response.headers.get('content-disposition'),
  };
}

async function serviceRequest(path, options = {}) {
  return json(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      ...(options.headers ?? {}),
    },
  });
}

async function createSession() {
  const email = `${marker}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const created = await serviceRequest('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200);
  assert(typeof created.payload?.id === 'string');
  createdUsers.push(created.payload.id);
  const signed = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signed.status, 200);
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const cookie = `sb-${projectRef}-auth-token=base64-${Buffer.from(
    JSON.stringify(signed.payload),
  ).toString('base64url')}`;
  return { userId: created.payload.id, cookie };
}

async function app(session, path, method = 'GET', body) {
  return json(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      cookie: session.cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function rawX25519PublicKey(key) {
  return Buffer.from(key.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64url');
}

function rawX25519PrivateKey(key) {
  return Buffer.from(key.export({ format: 'der', type: 'pkcs8' }))
    .subarray(-32)
    .toString('base64url');
}

function runControlledClient(input) {
  const result = spawnSync(controlledClient, [], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, 'Qalem Local controlled client refused the proof harness');
  return JSON.parse(result.stdout);
}

function publicEd25519Key(x) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

function verifySigned(value, publicKey) {
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(JSON.stringify(value.claims)),
      publicKey,
      Buffer.from(value.signature, 'base64url'),
    ),
    true,
  );
}

function decryptArtifact(bytes, devicePrivateKey, publicKey) {
  const artifact = JSON.parse(bytes.toString('utf8'));
  verifySigned(artifact.package.license, publicKey);
  const license = Buffer.from(JSON.stringify(artifact.package.license));
  const ephemeralPrefix = Buffer.from('302a300506032b656e032100', 'hex');
  const peer = crypto.createPublicKey({
    key: Buffer.concat([
      ephemeralPrefix,
      Buffer.from(artifact.key_envelope.ephemeral_public_key, 'base64url'),
    ]),
    format: 'der',
    type: 'spki',
  });
  const key = crypto.hkdfSync(
    'sha256',
    crypto.diffieHellman({ privateKey: devicePrivateKey, publicKey: peer }),
    license,
    Buffer.from('qalem-local-key-envelope-v1'),
    32,
  );
  const open = (ciphertext, nonce, aad, secret) => {
    const encrypted = Buffer.from(ciphertext, 'base64url');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      secret,
      Buffer.from(nonce, 'base64url'),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  };
  const contentKey = open(
    artifact.key_envelope.ciphertext,
    artifact.key_envelope.nonce,
    license,
    key,
  );
  return {
    artifact,
    content: open(artifact.package.ciphertext, artifact.package.nonce, license, contentKey),
  };
}

async function cleanup() {
  if (packageId && organizationId) {
    await serviceRequest(
      `/storage/v1/object/local-content-packages/${organizationId}/${packageId}.qalempkg`,
      {
        method: 'DELETE',
      },
    );
  }
  if (organizationId) {
    await serviceRequest(`/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    organizationId = undefined;
  }
  for (const userId of createdUsers.splice(0)) {
    await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }
}

async function countForOrganization(table, orgId) {
  const result = await serviceRequest(
    `/rest/v1/${table}?org_id=eq.${encodeURIComponent(orgId)}&select=id`,
  );
  assert.equal(result.status, 200);
  assert(Array.isArray(result.payload));
  return result.payload.length;
}

async function main() {
  const summary = {};
  try {
    stage = 'compte';
    const session = await createSession();
    stage = 'organisation';
    const organization = await serviceRequest('/rest/v1/organizations', {
      method: 'POST',
      headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `S2-012 ${marker}`,
        default_locale: 'fr-FR',
        status: 'active',
        seat_limit: 1,
      }),
    });
    assert.equal(organization.status, 201);
    organizationId = organization.payload?.[0]?.id;
    assert(typeof organizationId === 'string');
    const membership = await serviceRequest('/rest/v1/org_members', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: session.userId, org_id: organizationId, role: 'admin' }),
    });
    assert.equal(membership.status, 201);
    stage = 'source';
    const text =
      'Preuve locale contrôlée : l’apprentissage adulte relie expérience et application professionnelle.';
    const source = await app(session, '/api/source-library', 'POST', {
      orgId: organizationId,
      name: `${marker}.txt`,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(text),
      parserId: 's2-012-production',
      content: { text, images: [] },
    });
    assert.equal(source.status, 201);
    const sourceId = source.payload?.source?.id;
    assert(typeof sourceId === 'string');
    stage = 'enrollement';
    const deviceId = crypto.randomUUID();
    const device = crypto.generateKeyPairSync('x25519');
    const enrolled = await app(session, '/api/local/devices', 'POST', {
      orgId: organizationId,
      deviceId,
      encryptionPublicKey: rawX25519PublicKey(device.publicKey),
      label: 'Recette S2-012',
    });
    assert.equal(enrolled.status, 201);
    stage = 'emission';
    const issued = await app(session, '/api/local/packages', 'POST', {
      orgId: organizationId,
      sourceId,
      deviceId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    assert.equal(issued.status, 201);
    packageId = issued.payload?.packageId;
    assert(typeof packageId === 'string');
    stage = 'telechargement';
    const download = await app(
      session,
      `/api/local/packages/${packageId}?orgId=${organizationId}&deviceId=${deviceId}`,
    );
    assert.equal(download.status, 200);
    assert.equal(download.contentType, 'application/octet-stream');
    assert.match(download.contentDisposition ?? '', /attachment; filename="[a-f0-9-]+\.qalempkg"/);
    const browserDownload = await json(
      `${base}/api/local/packages/${packageId}?orgId=${organizationId}&deviceId=${deviceId}`,
      { headers: { accept: 'text/html' } },
    );
    assert.equal(browserDownload.status, 401);
    const signing = await json(`${base}/api/local/public-key`);
    assert.equal(signing.status, 200);
    const publicKey = publicEd25519Key(signing.payload?.publicKey);
    const opened = decryptArtifact(download.bytes, device.privateKey, publicKey);
    assert.equal(opened.content.toString('utf8').includes('apprentissage adulte'), true);
    const licenseId = opened.artifact.package.license.claims.license_id;
    stage = 'statut-actif';
    const active = await json(
      `${base}/api/local/licenses/${licenseId}/status?deviceId=${deviceId}`,
    );
    assert.equal(active.status, 200);
    verifySigned(active.payload?.status, publicKey);
    assert.equal(active.payload.status.claims.revoked, false);
    const nativeActive = runControlledClient({
      mode: 'active',
      artifact: download.bytes.toString('base64url'),
      deviceSecret: rawX25519PrivateKey(device.privateKey),
      publicKey: signing.payload.publicKey,
      status: active.payload.status,
      now: Math.floor(Date.now() / 1000),
    });
    assert.deepEqual(nativeActive, {
      opened: true,
      contentBytes: opened.content.length,
      alteredManifestRefused: true,
      expiredRefused: true,
      wrongUserRefused: true,
      wrongTenantRefused: true,
      wrongDeviceRefused: true,
      wrongDeviceKeyRefused: true,
      staleStatusRefused: true,
    });
    stage = 'revocation';
    const revoked = await app(session, '/api/local/devices', 'DELETE', {
      orgId: organizationId,
      deviceId,
    });
    assert.equal(revoked.status, 204);
    const afterRevocation = await json(
      `${base}/api/local/licenses/${licenseId}/status?deviceId=${deviceId}`,
    );
    assert.equal(afterRevocation.status, 200);
    verifySigned(afterRevocation.payload?.status, publicKey);
    assert.equal(afterRevocation.payload.status.claims.revoked, true);
    const nativeRevoked = runControlledClient({
      mode: 'revoked',
      artifact: download.bytes.toString('base64url'),
      deviceSecret: rawX25519PrivateKey(device.privateKey),
      publicKey: signing.payload.publicKey,
      status: afterRevocation.payload.status,
      now: Math.floor(Date.now() / 1000),
    });
    assert.deepEqual(nativeRevoked, { revokedStatusRefused: true });
    const denied = await app(
      session,
      `/api/local/packages/${packageId}?orgId=${organizationId}&deviceId=${deviceId}`,
    );
    assert.equal(denied.status, 404);
    summary.statuses = {
      enrolled: enrolled.status,
      issued: issued.status,
      download: download.status,
      active: active.status,
      revoked: revoked.status,
      denied: denied.status,
      browser: browserDownload.status,
    };
    summary.controlledClient = { ...nativeActive, ...nativeRevoked };
    const cleanedOrganizationId = organizationId;
    await cleanup();
    const counts = await Promise.all([
      countForOrganization('organization_sources', cleanedOrganizationId),
      countForOrganization('local_client_devices', cleanedOrganizationId),
      countForOrganization('local_content_packages', cleanedOrganizationId),
      countForOrganization('local_content_licenses', cleanedOrganizationId),
    ]);
    assert.deepEqual(counts, [0, 0, 0, 0]);
    summary.cleanupRows = counts;
    console.log(JSON.stringify(summary));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`${stage}:${error instanceof Error ? error.name : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});

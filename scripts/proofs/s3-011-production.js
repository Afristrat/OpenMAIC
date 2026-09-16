import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anon && service, 'Missing required runtime configuration');

const marker = `s3011-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const users = [];
const organizations = [];
let stage = 'initialisation';

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // The proof exposes statuses only: no learner or provider payload leaves the runtime.
  }
  return { status: response.status, payload };
}

async function serviceRequest(path, options = {}) {
  return request(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      ...(options.headers ?? {}),
    },
  });
}

async function app(session, path, method = 'GET', body) {
  return request(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      cookie: session.cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function insert(table, row) {
  const result = await serviceRequest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
  assert.equal(result.status, 201, `Cannot insert ${table}`);
  assert(Array.isArray(result.payload) && result.payload.length === 1, `Missing ${table} row`);
  return result.payload[0];
}

async function createLearner() {
  const email = `${marker}-${users.length}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const created = await serviceRequest('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200);
  assert(typeof created.payload?.id === 'string');
  users.push(created.payload.id);
  const signed = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signed.status, 200);
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return {
    userId: created.payload.id,
    cookie: `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(signed.payload)).toString('base64url')}`,
  };
}

async function createOrganization(userId, suffix) {
  const organization = await insert('organizations', {
    name: `S3-011 ${marker} ${suffix}`,
    default_locale: 'fr-FR',
    status: 'active',
    seat_limit: 3,
  });
  organizations.push(organization.id);
  await insert('org_members', { user_id: userId, org_id: organization.id, role: 'admin' });
  return organization.id;
}

async function createFixture({ learner, orgId, suffix, courseId, sourceId, sourceVersion }) {
  const ownedCourseId = courseId ?? crypto.randomUUID();
  if (!courseId) {
    const stageId = `${marker}-${suffix}`;
    await insert('stages', {
      id: stageId,
      owner_id: learner.userId,
      org_id: orgId,
      name: `S3-011 ${suffix}`,
    });
    await insert('courses', {
      id: ownedCourseId,
      owner_id: learner.userId,
      org_id: orgId,
      stage_id: stageId,
      title: `S3-011 ${suffix}`,
      language: 'fr-FR',
      source_kind: 'generated',
      source_manifest_id: sourceId ?? null,
      status: 'ready',
      outline: {},
    });
  }
  const casting = await insert('castings', {
    user_id: learner.userId,
    course_id: ownedCourseId,
    lineup: { participants: [{ role: 'facilitateur', name: `S3-011 ${suffix}` }] },
    lineup_hash: crypto.createHash('sha256').update(`${marker}-${suffix}`).digest('hex'),
  });
  const live = await insert('live_sessions', {
    course_id: ownedCourseId,
    user_id: learner.userId,
    casting_id: casting.id,
    recorded: true,
    started_at: new Date(Date.now() - 1_000).toISOString(),
    ended_at: new Date().toISOString(),
  });
  const event = await insert('session_events', {
    session_id: live.id,
    ts_ms: 1,
    actor: 'user',
    event_type: 'learner_proposition',
    payload: { marker, suffix },
  });
  const seed = await insert('seeds', {
    session_id: live.id,
    persona: 'facilitateur',
    kind: 'highlight',
    content: { provenance: { event_id: event.id, source_kind: 'learner_proposition' } },
    source_event_id: event.id,
    source_kind: 'learner_proposition',
    source_version: sourceVersion ?? `course:${ownedCourseId}`,
  });
  const optedInAt = new Date();
  const plan = await insert('anchor_plans', {
    session_id: live.id,
    user_id: learner.userId,
    opted_in_at: optedInAt.toISOString(),
    ends_at: new Date(optedInAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });
  const delivery = await insert('anchor_deliveries', {
    plan_id: plan.id,
    seed_id: seed.id,
    delivery_kind: 'seed',
    scheduled_for: optedInAt.toISOString(),
    sent_at: optedInAt.toISOString(),
    dedupe_key: `${marker}-${suffix}`,
  });
  return {
    courseId: ownedCourseId,
    sessionId: live.id,
    eventId: event.id,
    seedId: seed.id,
    deliveryId: delivery.id,
  };
}

async function cleanup() {
  for (const organizationId of organizations.splice(0)) {
    await serviceRequest(`/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }
  for (const userId of users.splice(0)) {
    await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }
}

async function countOrganization(orgId) {
  const result = await serviceRequest(
    `/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=id`,
  );
  assert.equal(result.status, 200);
  assert(Array.isArray(result.payload));
  return result.payload.length;
}

async function main() {
  const summary = {};
  try {
    stage = 'comptes';
    const alice = await createLearner();
    const bruno = await createLearner();
    const clara = await createLearner();
    stage = 'tenants';
    const tenantOne = await createOrganization(alice.userId, 'tenant-un');
    await insert('org_members', { user_id: bruno.userId, org_id: tenantOne, role: 'apprenant' });
    const tenantTwo = await createOrganization(clara.userId, 'tenant-deux');
    stage = 'source';
    const sourceText = 'Une source de recette contrôlée, retirée après la création des rappels.';
    const source = await app(alice, '/api/source-library', 'POST', {
      orgId: tenantOne,
      name: `${marker}.txt`,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(sourceText),
      parserId: 's3-011-production',
      content: { text: sourceText, images: [] },
    });
    assert.equal(source.status, 201);
    const sourceId = source.payload?.source?.id;
    assert(typeof sourceId === 'string');
    const manifest = await insert('formation_source_manifests', {
      org_id: tenantOne,
      owner_id: alice.userId,
      version: 1,
      source_ids: [sourceId],
    });
    stage = 'parcours';
    const aliceFixture = await createFixture({
      learner: alice,
      orgId: tenantOne,
      suffix: 'alice',
      sourceId: manifest.id,
      sourceVersion: `manifest:${manifest.id}`,
    });
    const brunoFixture = await createFixture({
      learner: bruno,
      orgId: tenantOne,
      suffix: 'bruno',
      courseId: aliceFixture.courseId,
      sourceVersion: `manifest:${manifest.id}`,
    });
    const claraFixture = await createFixture({ learner: clara, orgId: tenantTwo, suffix: 'clara' });
    stage = 'provenance-refusee';
    const foreignProvenance = await serviceRequest('/rest/v1/seeds', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: aliceFixture.sessionId,
        persona: 'facilitateur',
        kind: 'highlight',
        content: {},
        source_event_id: claraFixture.eventId,
        source_kind: 'learner_proposition',
        source_version: 'foreign',
      }),
    });
    assert(foreignProvenance.status >= 400, 'Foreign provenance was accepted');
    stage = 'reflexion';
    const own = await app(
      alice,
      `/api/anchor-deliveries/${aliceFixture.deliveryId}/reflection`,
      'POST',
      {
        responseKind: 'action_in_practice',
        responseText: 'Je teste cette pratique dans mon contexte professionnel.',
      },
    );
    const duplicate = await app(
      alice,
      `/api/anchor-deliveries/${aliceFixture.deliveryId}/reflection`,
      'POST',
      {
        responseKind: 'active_recall',
        responseText: 'Tentative en double.',
      },
    );
    const sameTenantForeign = await app(
      bruno,
      `/api/anchor-deliveries/${aliceFixture.deliveryId}/reflection`,
      'POST',
      {
        responseKind: 'active_recall',
        responseText: 'Tentative hors parcours.',
      },
    );
    const crossTenantForeign = await app(
      clara,
      `/api/anchor-deliveries/${aliceFixture.deliveryId}/reflection`,
      'POST',
      {
        responseKind: 'active_recall',
        responseText: 'Tentative hors tenant.',
      },
    );
    assert.equal(own.status, 201);
    assert.equal(duplicate.status, 409);
    assert.equal(sameTenantForeign.status, 404);
    assert.equal(crossTenantForeign.status, 404);
    stage = 'retrait-source';
    const withdrawn = await serviceRequest(
      `/rest/v1/organization_sources?id=eq.${encodeURIComponent(sourceId)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );
    assert.equal(withdrawn.status, 204);
    const remaining = await serviceRequest(
      `/rest/v1/organization_sources?id=eq.${encodeURIComponent(sourceId)}&select=id`,
    );
    assert.equal(remaining.status, 200);
    assert.deepEqual(remaining.payload, []);
    const reflection = await serviceRequest(
      `/rest/v1/anchor_reflections?delivery_id=eq.${encodeURIComponent(aliceFixture.deliveryId)}&select=source_event_id,user_id`,
    );
    assert.equal(reflection.status, 200);
    assert.equal(reflection.payload?.length, 1);
    assert.equal(String(reflection.payload[0].source_event_id), String(aliceFixture.eventId));
    assert.equal(reflection.payload[0].user_id, alice.userId);
    summary.statuses = {
      ownReflection: own.status,
      duplicateReflection: duplicate.status,
      sameTenantForeign: sameTenantForeign.status,
      crossTenantForeign: crossTenantForeign.status,
      foreignProvenance: foreignProvenance.status,
      sourceWithdrawal: withdrawn.status,
    };
    summary.distinctEventIds = aliceFixture.eventId !== brunoFixture.eventId;
    const cleanedTenantOne = tenantOne;
    const cleanedTenantTwo = tenantTwo;
    await cleanup();
    const cleanupRows = await Promise.all([
      countOrganization(cleanedTenantOne),
      countOrganization(cleanedTenantTwo),
    ]);
    assert.deepEqual(cleanupRows, [0, 0]);
    summary.cleanupRows = cleanupRows;
    console.log(JSON.stringify(summary));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`${stage}:${error instanceof Error ? error.message : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});

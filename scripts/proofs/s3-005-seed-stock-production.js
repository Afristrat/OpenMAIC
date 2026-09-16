import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anon && service, 'Missing required runtime configuration');

const marker = `s3005-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const users = [];
const organizations = [];
let originalAnchoring = false;
let stage = 'initialisation';

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // This proof emits only controlled statuses and aggregate counts.
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

async function app(session, path, body) {
  return request(`${base}${path}`, {
    method: 'POST',
    headers: { origin: base, cookie: session.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

async function createFixture(learner, stockSize) {
  const organization = await insert('organizations', {
    name: `S3-005 ${marker} ${stockSize}`,
    default_locale: 'fr-FR',
    status: 'active',
    seat_limit: 2,
  });
  organizations.push(organization.id);
  await insert('org_members', { user_id: learner.userId, org_id: organization.id, role: 'admin' });
  const stageId = `${marker}-${stockSize}`;
  await insert('stages', {
    id: stageId,
    owner_id: learner.userId,
    org_id: organization.id,
    name: `S3-005 ${stockSize}`,
  });
  const course = await insert('courses', {
    id: crypto.randomUUID(),
    owner_id: learner.userId,
    org_id: organization.id,
    stage_id: stageId,
    title: `S3-005 ${stockSize}`,
    language: 'fr-FR',
    source_kind: 'generated',
    status: 'ready',
    outline: {},
  });
  const casting = await insert('castings', {
    user_id: learner.userId,
    course_id: course.id,
    lineup: { participants: [{ role: 'facilitateur', name: 'Hanae' }] },
    lineup_hash: crypto.createHash('sha256').update(`${marker}-${stockSize}`).digest('hex'),
  });
  const live = await insert('live_sessions', {
    course_id: course.id,
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
    payload: { marker, stockSize },
  });
  const kinds = [
    ...Array(4).fill('anecdote'),
    ...Array(4).fill('highlight'),
    ...Array(2).fill('joke'),
    ...Array(2).fill('quiz_reminder'),
  ];
  const extraCycle = ['anecdote', 'highlight', 'joke', 'quiz_reminder'];
  while (kinds.length < stockSize) kinds.push(extraCycle[(kinds.length - 12) % extraCycle.length]);
  const seeds = [];
  for (const kind of kinds) {
    seeds.push(
      await insert('seeds', {
        session_id: live.id,
        persona: 'Hanae',
        kind,
        content: { provenance: { event_id: event.id, source_kind: 'learner_proposition' } },
        source_event_id: event.id,
        source_kind: 'learner_proposition',
        source_version: `course:${course.id}`,
      }),
    );
  }
  return { sessionId: live.id, seeds };
}

async function setAnchoring(enabled) {
  const result = await serviceRequest('/rest/v1/feature_flags?flag_name=eq.anchoring', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  assert.equal(result.status, 200, 'Cannot update anchoring flag');
  assert.equal(result.payload?.length, 1, 'Anchoring flag missing');
}

async function deliveries(planId) {
  const result = await serviceRequest(
    `/rest/v1/anchor_deliveries?plan_id=eq.${encodeURIComponent(planId)}&select=seed_id,delivery_kind,scheduled_for,dedupe_key&order=scheduled_for.asc`,
  );
  assert.equal(result.status, 200);
  return result.payload;
}

function assertPlan(stockSize, fixture, response, rows) {
  assert.equal(response.status, 201, `Stock ${stockSize} was rejected`);
  assert.equal(response.payload?.deliveryCount, 14);
  assert.equal(response.payload?.selectedSeedIds?.length, 12);
  assert.equal(rows.length, 14);
  assert.equal(new Set(rows.map((row) => row.dedupe_key)).size, 14);
  assert(
    rows.every((row, index) => index === 0 || row.scheduled_for > rows[index - 1].scheduled_for),
  );
  const selected = new Map(fixture.seeds.map((seed) => [seed.id, seed.kind]));
  const selectedKinds = response.payload.selectedSeedIds.map((id) => selected.get(id));
  for (const [kind, expected] of Object.entries({
    anecdote: 4,
    highlight: 4,
    joke: 2,
    quiz_reminder: 2,
  })) {
    assert.equal(
      selectedKinds.filter((value) => value === kind).length,
      expected,
      `Bad ${kind} mix`,
    );
  }
  const plannedSeedIds = rows
    .filter((row) => row.delivery_kind !== 'cold_eval')
    .map((row) => row.seed_id);
  assert.deepEqual(new Set(plannedSeedIds), new Set(response.payload.selectedSeedIds));
  assert.equal(new Set(plannedSeedIds).size, 12);
  assert.equal(fixture.seeds.length - plannedSeedIds.length, stockSize - 12);
  const first = new Date(rows[0].scheduled_for).getTime();
  const last = new Date(rows.at(-1).scheduled_for).getTime();
  assert(last - first <= 90 * 24 * 60 * 60 * 1000, 'Calendar exceeds J+90');
}

async function cleanup() {
  await setAnchoring(originalAnchoring).catch(() => undefined);
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

async function main() {
  const summary = {};
  try {
    stage = 'flag';
    const flag = await serviceRequest(
      '/rest/v1/feature_flags?flag_name=eq.anchoring&select=enabled',
    );
    assert.equal(flag.status, 200);
    assert.equal(flag.payload?.length, 1, 'Anchoring flag missing');
    originalAnchoring = flag.payload[0].enabled;
    await setAnchoring(true);
    stage = 'stocks';
    const learner = await createLearner();
    for (const stockSize of [12, 13, 20]) {
      const fixture = await createFixture(learner, stockSize);
      const response = await app(learner, `/api/live-sessions/${fixture.sessionId}/anchor-plan`, {
        optedIn: true,
      });
      const rows = await deliveries(response.payload?.plan?.id);
      assertPlan(stockSize, fixture, response, rows);
      summary[stockSize] = {
        status: response.status,
        deliveries: rows.length,
        selected: response.payload.selectedSeedIds.length,
      };
    }
    stage = 'cleanup';
    await cleanup();
    summary.flagRestored = originalAnchoring;
    console.log(JSON.stringify(summary));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`${stage}:${error instanceof Error ? error.message : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});

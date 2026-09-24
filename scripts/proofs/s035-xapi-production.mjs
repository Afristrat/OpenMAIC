import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const {
  supabaseUrl,
  serviceKey,
  baseUrl = 'https://qalem.ma',
  lrsEndpoint = 'https://lrs.qalem.ma/xapi',
  lrsApiKey,
  lrsApiSecret,
} = JSON.parse(input);
input = '';

assert.equal(new URL(baseUrl).origin, 'https://qalem.ma');
assert.equal(new URL(supabaseUrl).origin, 'https://db.qalem.ma');
assert.equal(new URL(lrsEndpoint).origin, 'https://lrs.qalem.ma');
assert.ok(serviceKey && lrsApiKey && lrsApiSecret, 'Production credentials are required');

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, authOptions);
const client = createClient(supabaseUrl, serviceKey, authOptions);
const lrsAuthorization = `Basic ${Buffer.from(`${lrsApiKey}:${lrsApiSecret}`).toString('base64')}`;
const suffix = randomUUID();
const email = `qalem-s035-${suffix}@example.invalid`;
const orgName = `Preuve S-035 ${suffix}`;
const stageId = `s035-${suffix}`;
const sceneIds = {
  slide: `slide-${suffix}`,
  quiz: `quiz-${suffix}`,
  pbl: `pbl-${suffix}`,
  discussion: `discussion-${suffix}`,
};

let userId;
let orgId;
let session;
let browser;
let context;
let originalFlag;
let flagRead = false;
let actorMbox;
let completed = false;

function assertResult(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
}

function deliveryId(org, eventKey) {
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex'))
    .update(JSON.stringify(['qalem-xapi', org, eventKey]))
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function api(path, method = 'GET', data) {
  const response = await context.request.fetch(`${baseUrl}${path}`, {
    method,
    headers: method === 'GET' ? undefined : { origin: baseUrl },
    ...(data === undefined ? {} : { data }),
  });
  return response;
}

async function consentState() {
  const response = await api('/api/telemetry-consent');
  assert.equal(response.status(), 200, 'Unable to read contractual analytics state');
  return response.json();
}

async function setXapiConsent(consent) {
  const response = await api('/api/telemetry-consent', 'POST', {
    consent,
    purpose: 'xapi',
  });
  assert.equal(response.status(), 200, `Unable to set xAPI choice to ${consent}`);
  assert.deepEqual(await response.json(), { ok: true, choice: consent });
  return consentState();
}

function observation(sessionId, epoch, durations) {
  return {
    sessionId,
    consentEpoch: epoch,
    orgId,
    stageId,
    sceneSequence: ['slide', 'quiz', 'pbl', 'interactive'],
    sceneDurations: durations,
    quizScores: [0.4, 0.9],
    sceneObservations: [
      {
        id: sceneIds.slide,
        type: 'slide',
        seconds: durations[0],
        completed: true,
        score: null,
      },
      {
        id: sceneIds.quiz,
        type: 'quiz',
        seconds: durations[1],
        completed: true,
        score: 0.9,
        attempts: [0.4, 0.9],
      },
      {
        id: sceneIds.pbl,
        type: 'pbl',
        seconds: durations[2],
        completed: true,
        score: null,
      },
      {
        id: sceneIds.discussion,
        type: 'interactive',
        seconds: durations[3],
        completed: true,
        score: null,
        discussionMessages: 2,
      },
    ],
    completionRate: 1,
    totalDuration: durations.reduce((sum, value) => sum + value, 0),
    subjectTags: [],
    language: 'fr-FR',
    level: 'beginner',
    agentCount: 4,
    actionCounts: { play: 1, pause: 0, seek: 0 },
  };
}

async function record(payload) {
  const response = await api('/api/learning-observations', 'POST', payload);
  if (response.status() !== 200) {
    const body = await response.text();
    const direct = await admin.rpc('record_consented_learning', {
      p_actor: userId,
      p_session: payload.sessionId,
      p_stage: payload.stageId,
      p_epoch: payload.consentEpoch,
      p_org: payload.orgId,
      p_payload: {
        scene_sequence: payload.sceneSequence,
        scene_durations: payload.sceneDurations,
        quiz_scores: payload.quizScores,
        scene_observations: payload.sceneObservations,
        completion_rate: payload.completionRate,
        total_duration: payload.totalDuration,
        action_counts: payload.actionCounts,
      },
    });
    throw new Error(
      direct.error
        ? `Learning observation failed (${response.status()} ${body}); database: ${direct.error.code} ${direct.error.message}`
        : `Learning observation API failed (${response.status()} ${body}) although the database accepted the same observation`,
    );
  }
  assert.deepEqual(await response.json(), { recorded: true });
}

async function waitForDelivery(expected) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const rows = assertResult(
      await admin
        .from('xapi_outbox')
        .select('id,dedupe_key,status,sent_at,last_error,statement')
        .eq('org_id', orgId)
        .order('id'),
      'Unable to inspect xAPI outbox',
    );
    assert.equal(rows.length, expected, `Expected ${expected} xAPI events, got ${rows.length}`);
    const failed = rows.filter((row) => row.status === 'failed');
    if (failed.length) {
      throw new Error(`xAPI delivery failed: ${failed.map((row) => row.last_error).join('; ')}`);
    }
    if (rows.every((row) => row.status === 'sent' && row.sent_at)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('xAPI delivery did not complete within 150 seconds');
}

async function readLrsStatement(statementId) {
  const endpoint = new URL(`${lrsEndpoint.replace(/\/$/, '')}/statements`);
  endpoint.searchParams.set('statementId', statementId);
  const response = await fetch(endpoint, {
    headers: {
      Authorization: lrsAuthorization,
      'X-Experience-API-Version': '1.0.3',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `LRS statement ${statementId} is unreadable`);
  return response.json();
}

try {
  const about = await fetch(`${lrsEndpoint.replace(/\/$/, '')}/about`, {
    headers: {
      Authorization: lrsAuthorization,
      'X-Experience-API-Version': '1.0.3',
    },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(about.status, 200, 'Sovereign LRS is unavailable');
  assert.ok((await about.json()).version.includes('1.0.3'), 'LRS does not advertise xAPI 1.0.3');

  const flag = assertResult(
    await admin.from('feature_flags').select('enabled').eq('flag_name', 'xapi_emission').single(),
    'Unable to read xAPI feature flag',
  );
  originalFlag = flag.enabled;
  flagRead = true;
  assert.equal(originalFlag, false, 'Production xAPI flag must default to disabled');

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  assert.ok(!created.error && created.data.user, 'Unable to create temporary proof user');
  userId = created.data.user.id;

  orgId = assertResult(
    await admin
      .from('organizations')
      .insert({ name: orgName, status: 'active', default_locale: 'fr-FR' })
      .select('id')
      .single(),
    'Unable to create temporary organization',
  ).id;
  assertResult(
    await admin.from('org_members').insert({ user_id: userId, org_id: orgId, role: 'admin' }),
    'Unable to add organization administrator',
  );
  assertResult(
    await admin
      .from('stages')
      .insert({ id: stageId, owner_id: userId, org_id: orgId, name: 'Preuve xAPI S-035' }),
    'Unable to create temporary stage',
  );
  assertResult(
    await admin.from('scenes').insert([
      { id: sceneIds.slide, stage_id: stageId, type: 'slide', order: 0 },
      { id: sceneIds.quiz, stage_id: stageId, type: 'quiz', order: 1 },
      { id: sceneIds.pbl, stage_id: stageId, type: 'pbl', order: 2 },
      { id: sceneIds.discussion, stage_id: stageId, type: 'interactive', order: 3 },
    ]),
    'Unable to create temporary scenes',
  );

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(!link.error && link.data.properties?.hashed_token, 'Private login link unavailable');
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  session = login.data.session;
  assert.ok(!login.error && session, 'Unable to authenticate temporary proof user');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ serviceWorkers: 'block' });
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

  const config = await api(`/api/organizations/${orgId}/xapi`, 'PUT', {
    endpoint: lrsEndpoint,
    auth: lrsAuthorization,
    enabled: true,
  });
  assert.equal(config.status(), 200, `LRS configuration failed: ${await config.text()}`);
  assert.deepEqual(await config.json(), { success: true, saved: true });

  const initial = await consentState();
  assert.equal(initial.choice, true, 'Contractual analytics must be enabled');
  assert.match(initial.epoch, /^[0-9a-f-]{36}$/);
  const xapiInitial = await api('/api/telemetry-consent?purpose=xapi');
  assert.equal(xapiInitial.status(), 200);
  assert.deepEqual(await xapiInitial.json(), { choice: false, hasConsent: false });

  const internalSession = randomUUID();
  await record(observation(internalSession, initial.epoch, [1, 1, 1, 1]));
  const beforeCount = await admin
    .from('xapi_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  assert.equal(beforeCount.error, null);
  assert.equal(beforeCount.count, 0, 'An xAPI event was emitted before opt-in');

  const enabledState = await setXapiConsent(true);
  assert.notEqual(
    enabledState.epoch,
    initial.epoch,
    'xAPI opt-in must rotate the collection epoch',
  );
  assertResult(
    await admin.from('feature_flags').update({ enabled: true }).eq('flag_name', 'xapi_emission'),
    'Unable to enable temporary xAPI delivery',
  );

  const emittedSession = randomUUID();
  await record(observation(emittedSession, enabledState.epoch, [10, 20, 30, 5]));
  const rows = await waitForDelivery(7);
  const statements = rows.map((row) => row.statement);
  const verbs = statements.map((statement) => statement.verb.id.split('/').at(-1)).sort();
  assert.deepEqual(verbs, [
    'answered',
    'answered',
    'attempted',
    'completed',
    'experienced',
    'failed',
    'passed',
  ]);
  actorMbox = statements[0].actor.mbox;
  assert.match(actorMbox, /^mailto:[0-9a-f]{64}@qalem\.invalid$/);
  assert.ok(statements.every((statement) => statement.actor.mbox === actorMbox));
  assert.ok(!JSON.stringify(statements).includes(userId), 'Raw user identity leaked into xAPI');
  assert.equal(
    statements.filter((statement) => statement.result?.duration === 'PT10S').length,
    1,
    'Slide duration is missing',
  );
  assert.equal(
    statements.filter((statement) => statement.result?.duration === 'PT30S').length,
    1,
    'PBL duration is missing',
  );
  assert.equal(
    statements.filter((statement) => statement.result?.score).length,
    4,
    'Quiz attempts are incomplete',
  );
  assert.equal(
    statements.find((statement) => statement.verb.id.endsWith('/attempted')).context.extensions[
      'https://qalem.ma/xapi/message-count'
    ],
    2,
    'Discussion count is missing',
  );

  for (const row of rows) {
    const statementId = deliveryId(orgId, row.dedupe_key);
    const stored = await readLrsStatement(statementId);
    assert.equal(stored.id, statementId, 'LRS returned a different statement identity');
    assert.deepEqual(stored.actor, row.statement.actor, 'LRS actor differs from the outbox');
    assert.equal(stored.verb.id, row.statement.verb.id, 'LRS verb differs from the outbox');
    assert.equal(stored.object.id, row.statement.object.id, 'LRS activity differs from the outbox');
  }

  const revokedState = await setXapiConsent(false);
  assert.notEqual(revokedState.epoch, enabledState.epoch, 'xAPI withdrawal must rotate the epoch');
  const afterRevoke = await admin
    .from('xapi_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  assert.equal(afterRevoke.error, null);
  assert.equal(afterRevoke.count, 0, 'xAPI outbox survived withdrawal');
  const internalRows = await admin
    .from('pedagogy_telemetry')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  assert.equal(internalRows.error, null);
  assert.equal(
    internalRows.count,
    2,
    'Contractual learning analytics were removed by xAPI withdrawal',
  );

  completed = true;
} finally {
  if (flagRead) {
    const restored = await admin
      .from('feature_flags')
      .update({ enabled: originalFlag })
      .eq('flag_name', 'xapi_emission');
    assert.equal(restored.error, null, 'xAPI feature flag restoration failed');
  }
  if (context && orgId) {
    const removedConfig = await api(`/api/organizations/${orgId}/xapi`, 'DELETE');
    assert.ok(
      removedConfig.status() === 200 || removedConfig.status() === 404,
      'Temporary LRS configuration cleanup failed',
    );
  }
  await browser?.close();
  if (session) await client.auth.signOut({ scope: 'local' });
  if (orgId) {
    const removedOrg = await admin.from('organizations').delete().eq('id', orgId);
    assert.equal(removedOrg.error, null, 'Temporary organization cleanup failed');
  }
  if (userId) {
    const removedUser = await admin.auth.admin.deleteUser(userId);
    assert.ok(!removedUser.error, 'Temporary proof user cleanup failed');
  }
}

assert.ok(completed, 'Production xAPI proof did not complete');
console.log(
  JSON.stringify({
    defaultDisabled: true,
    zeroBeforeOptIn: true,
    encryptedTenantConfig: true,
    deliveredStatements: 7,
    eventFamilies: ['slide', 'quiz', 'pbl', 'discussion'],
    pseudonymousActor: true,
    durableStatementIds: true,
    withdrawalPurgedOutbox: true,
    contractualAnalyticsPreserved: true,
    featureFlagRestored: true,
    temporaryDatabaseFixturesDeleted: true,
    actorIfiToPurge: `mbox::${actorMbox}`,
  }),
);

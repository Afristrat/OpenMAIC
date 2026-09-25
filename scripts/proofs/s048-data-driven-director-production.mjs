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
} = JSON.parse(input.replace(/^\uFEFF/, ''));
input = '';

assert.equal(new URL(baseUrl).origin, 'https://qalem.ma');
assert.equal(new URL(supabaseUrl).origin, 'https://db.qalem.ma');
assert.ok(serviceKey, 'Production service credential is required');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, options);
const suffix = randomUUID();
const stageId = `s048-${suffix}`;
const sceneId = `quiz-${suffix}`;
const agentIds = [`mentor-${suffix}`, `coach-${suffix}`, `analyst-${suffix}`];
const organizationName = `Preuve S-048 ${suffix}`;
const ownerEmail = `qalem-s048-owner-${suffix}@example.invalid`;

let organizationId;
let ownerId;
let courseId;
let browser;
const createdUsers = [];
const contexts = [];
let completed = false;

function assertResult(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
}

function isDataDriven(userId) {
  const key = JSON.stringify([userId.toLowerCase(), organizationId.toLowerCase(), stageId]);
  return createHash('sha256').update(`qalem-director-v1:${key}`).digest().readUInt32BE(0) % 2 === 0;
}

async function authenticatedContext(email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(!link.error && link.data.properties?.hashed_token, 'Private login link unavailable');
  const client = createClient(supabaseUrl, serviceKey, options);
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  assert.ok(!login.error && login.data.session, 'Temporary account authentication failed');
  const context = await browser.newContext({ serviceWorkers: 'block' });
  contexts.push(context);
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(login.data.session)).toString('base64url')}`;
  const parts = encoded.match(/.{1,3180}/g);
  assert.ok(parts);
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
  return context;
}

async function api(context, path, method = 'GET', data) {
  return context.request.fetch(`${baseUrl}${path}`, {
    method,
    headers: method === 'GET' ? undefined : { origin: baseUrl },
    ...(data === undefined ? {} : { data }),
    timeout: 120_000,
  });
}

function eventsFrom(body) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

async function runDirector(context, expected) {
  const body = {
    orgId: organizationId,
    messages: [
      {
        id: randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: 'Je souhaite que Mentor me pose une question courte.' }],
      },
    ],
    storeState: {
      stage: { id: stageId, name: 'Preuve Director S-048', mode: 'playback' },
      scenes: [
        {
          id: sceneId,
          stageId,
          order: 0,
          type: 'quiz',
          title: 'Quiz de preuve',
          content: { type: 'quiz', questions: [] },
          actions: [],
        },
      ],
      currentSceneId: sceneId,
      mode: 'playback',
      whiteboardOpen: false,
    },
    config: {
      agentIds,
      sessionType: 'discussion',
      agentConfigs: agentIds.map((id, index) => ({
        id,
        name: index === 0 ? 'Mentor' : index === 1 ? 'Coach' : 'Analyste',
        role: index === 0 ? 'teacher' : index === 1 ? 'assistant' : 'student',
        persona: 'Répondre brièvement, en français, avec une question utile.',
        avatar: '',
        color: ['#2563eb', '#7c3aed', '#059669'][index],
        allowedActions: [],
        priority: 1,
      })),
    },
    directorState: { turnCount: 0, agentResponses: [], whiteboardLedger: [] },
    apiKey: '',
    model: 'general',
  };
  const response = await api(context, '/api/chat', 'POST', body);
  const text = await response.text();
  assert.equal(response.status(), 200, `Director chat failed: ${text.slice(0, 1000)}`);
  const events = eventsFrom(text);
  assert.ok(!events.some((event) => event.type === 'error'), `Director stream error: ${text}`);
  const observed = events.find(
    (event) => event.type === 'thinking' && event.data?.directorObservation,
  )?.data.directorObservation;
  assert.ok(observed, `Director observation is absent: ${text.slice(0, 1500)}`);
  assert.equal(observed.cohort, expected.cohort);
  assert.equal(observed.reason, expected.reason);
  if (expected.sampleSize === null) assert.equal(observed.suggestion, null);
  else {
    assert.equal(observed.suggestion?.agentId, agentIds[1]);
    assert.equal(observed.suggestion?.sampleSize, expected.sampleSize);
    assert.equal(observed.suggestion?.evidence, 'observational');
    assert.equal(
      events.find((event) => event.type === 'agent_start')?.data.agentId,
      agentIds[1],
      'The observed choice did not become the generated agent',
    );
  }
  assert.ok(events.some((event) => event.type === 'text_delta' && event.data?.content));
  assert.ok(events.some((event) => event.type === 'done'));
  return observed;
}

async function analyticsState(context) {
  const response = await api(context, '/api/telemetry-consent');
  assert.equal(response.status(), 200, 'Contractual analytics state is unavailable');
  const state = await response.json();
  assert.equal(state.choice, true, 'Contractual analytics are not provisioned');
  assert.match(state.epoch, /^[0-9a-f-]{36}$/);
  return state;
}

async function recordPattern(context, epoch, index) {
  const discussionId = randomUUID();
  const sessionId = randomUUID();
  const observation = {
    sessionId,
    consentEpoch: epoch,
    orgId: organizationId,
    stageId,
    sceneSequence: ['quiz'],
    sceneDurations: [10 + index],
    quizScores: [],
    sceneObservations: [
      {
        id: sceneId,
        type: 'quiz',
        seconds: 10 + index,
        completed: false,
        score: null,
        discussionMessages: 2,
      },
    ],
    discussions: [
      {
        discussionId,
        sceneId,
        durationBasis: 'client-monotonic-elapsed',
        classificationMethod: 'text-heuristic-v1',
        turns: [
          {
            id: `coach-${index}-${suffix}`,
            agentId: agentIds[1],
            interventionType: 'question',
            durationMs: 1000 + index,
            outcome: 'completed',
          },
          {
            id: `mentor-${index}-${suffix}`,
            agentId: agentIds[0],
            interventionType: 'synthesis',
            durationMs: 2000 + index,
            outcome: 'completed',
          },
        ],
        postDiscussionQuiz: null,
      },
    ],
    completionRate: 0,
    totalDuration: 10 + index,
    subjectTags: [],
    language: 'fr-FR',
    level: null,
    agentCount: 3,
    actionCounts: { play: 1, pause: 0, seek: 0 },
  };
  const collected = await api(context, '/api/learning-observations', 'POST', observation);
  assert.equal(collected.status(), 200, `Discussion collection failed: ${await collected.text()}`);
  const quiz = await api(context, '/api/quiz-attempts', 'POST', {
    requestId: randomUUID(),
    orgId: organizationId,
    stageId,
    sceneId,
    answers: { q1: index % 2 === 0 ? 'a' : 'b' },
  });
  assert.equal(quiz.status(), 200, `Native quiz failed: ${await quiz.text()}`);
  const result = await quiz.json();
  assert.equal(result.success, true);
  assert.equal(result.status, 'completed');
  return { discussionId, score: result.score };
}

try {
  const owner = await admin.auth.admin.createUser({ email: ownerEmail, email_confirm: true });
  assert.ok(!owner.error && owner.data.user, 'Temporary owner creation failed');
  ownerId = owner.data.user.id;
  createdUsers.push(ownerId);
  organizationId = assertResult(
    await admin
      .from('organizations')
      .insert({ name: organizationName, status: 'active', default_locale: 'fr-FR', seat_limit: 24 })
      .select('id')
      .single(),
    'Temporary organization creation failed',
  ).id;
  assertResult(
    await admin
      .from('org_members')
      .insert({ org_id: organizationId, user_id: ownerId, role: 'admin' }),
    'Temporary owner membership creation failed',
  );
  const allocation = assertResult(
    await admin.rpc('post_tenant_credit_entry', {
      actor_user_id: ownerId,
      tenant_id: organizationId,
      credit_entry_type: 'allocation',
      credit_delta_microunits: 100_000_000,
      credit_idempotency_key: `s048-${suffix}-allocation`,
      credit_reason: 'Allocation jetable pour la recette S-048',
    }),
    'Temporary credit allocation failed',
  );
  assert.equal(allocation?.[0]?.applied, true, 'Temporary credits were not allocated');
  assertResult(
    await admin.from('stages').insert({
      id: stageId,
      owner_id: ownerId,
      org_id: organizationId,
      name: 'Preuve Director S-048',
      language: 'fr-FR',
      agent_ids: agentIds,
    }),
    'Temporary classroom creation failed',
  );
  assertResult(
    await admin.from('scenes').insert({
      id: sceneId,
      stage_id: stageId,
      type: 'quiz',
      order: 0,
      content: {
        type: 'quiz',
        questions: [
          {
            id: 'q1',
            type: 'single',
            question: 'Quel choix est correct ?',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
            answer: ['a'],
            points: 1,
          },
        ],
      },
    }),
    'Temporary quiz scene creation failed',
  );
  courseId = assertResult(
    await admin
      .from('courses')
      .insert({
        owner_id: ownerId,
        org_id: organizationId,
        stage_id: stageId,
        title: 'Director S-048',
        language: 'fr-FR',
        source_kind: 'generated',
        status: 'ready',
        outline: { analyticsContext: { subjectTags: ['SIPOC'] } },
      })
      .select('id')
      .single(),
    'Temporary course creation failed',
  ).id;

  let dataUser;
  let classicUser;
  for (let index = 0; index < 20 && (!dataUser || !classicUser); index++) {
    const email = `qalem-s048-${index}-${suffix}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    assert.ok(!created.error && created.data.user, 'Temporary learner creation failed');
    const user = { id: created.data.user.id, email };
    createdUsers.push(user.id);
    assertResult(
      await admin.from('org_members').insert({
        org_id: organizationId,
        user_id: user.id,
        role: 'apprenant',
      }),
      'Temporary learner membership creation failed',
    );
    if (isDataDriven(user.id) && !dataUser) dataUser = user;
    if (!isDataDriven(user.id) && !classicUser) classicUser = user;
  }
  assert.ok(dataUser && classicUser, 'Both stable Director cohorts were not obtained');

  browser = await chromium.launch({ headless: true });
  const dataContext = await authenticatedContext(dataUser.email);
  const classicContext = await authenticatedContext(classicUser.email);
  const dataAnalytics = await analyticsState(dataContext);
  await analyticsState(classicContext);

  await runDirector(dataContext, {
    cohort: 'data-driven',
    reason: 'no-compatible-pattern',
    sampleSize: null,
  });
  const first = await recordPattern(dataContext, dataAnalytics.epoch, 0);
  await runDirector(dataContext, {
    cohort: 'data-driven',
    reason: 'observed-pattern',
    sampleSize: 1,
  });
  const second = await recordPattern(dataContext, dataAnalytics.epoch, 1);
  const third = await recordPattern(dataContext, dataAnalytics.epoch, 2);
  await runDirector(dataContext, {
    cohort: 'data-driven',
    reason: 'observed-pattern',
    sampleSize: 3,
  });
  await runDirector(classicContext, { cohort: 'classic', reason: 'control', sampleSize: null });

  const dataExport = await api(dataContext, '/api/account/export');
  assert.equal(dataExport.status(), 200, `Data-driven export failed: ${await dataExport.text()}`);
  const dataBody = await dataExport.json();
  const receipts = dataBody.director_receipts;
  assert.ok(Array.isArray(receipts) && receipts.length >= 3);
  assert.ok(receipts.some((receipt) => receipt.reason === 'no-compatible-pattern'));
  assert.ok(
    receipts.some(
      (receipt) =>
        receipt.reason === 'observed-pattern' &&
        receipt.sample_size === 1 &&
        receipt.selected_agent === agentIds[1] &&
        receipt.generation_outcome === 'completed',
    ),
  );
  assert.ok(
    receipts.some(
      (receipt) =>
        receipt.reason === 'observed-pattern' &&
        receipt.sample_size === 3 &&
        receipt.selected_agent === agentIds[1] &&
        receipt.generation_outcome === 'completed',
    ),
  );
  const classicExport = await api(classicContext, '/api/account/export');
  assert.equal(classicExport.status(), 200, 'Classic export failed');
  const classicBody = await classicExport.json();
  assert.ok(
    classicBody.director_receipts.some(
      (receipt) => receipt.cohort === 'classic' && receipt.reason === 'control',
    ),
  );

  const report = assertResult(
    await admin.rpc('read_director_experiment', {
      p_actor: ownerId,
      p_org: organizationId,
      p_stage: stageId,
    }),
    'Director experiment report failed',
  );
  assert.ok(report.some((row) => row.cohort === 'data-driven'));
  assert.ok(report.some((row) => row.cohort === 'classic'));
  assert.deepEqual(
    [first.score, second.score, third.score].sort((a, b) => a - b),
    [0, 100, 100],
  );
  completed = true;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
  for (const userId of createdUsers.toReversed()) await admin.auth.admin.deleteUser(userId);
  if (courseId) await admin.from('courses').delete().eq('id', courseId);
  await admin.from('scenes').delete().eq('stage_id', stageId);
  await admin.from('stages').delete().eq('id', stageId);
  if (organizationId) await admin.from('organizations').delete().eq('id', organizationId);
}

assert.ok(completed);
for (const [table, column, value] of [
  ['organizations', 'name', organizationName],
  ['stages', 'id', stageId],
  ['scenes', 'stage_id', stageId],
  ['courses', 'id', courseId],
]) {
  const remaining = await admin
    .from(table)
    .select(column, { count: 'exact', head: true })
    .eq(column, value);
  assert.equal(remaining.error, null, `${table} final cleanup lookup failed`);
  assert.equal(remaining.count, 0, `${table} retained synthetic fixtures`);
}

console.log(
  JSON.stringify({
    stableCohorts: ['classic', 'data-driven'],
    realChatGenerations: 4,
    zeroObservationFallback: true,
    firstObservationUsed: true,
    multipleObservationsUsed: 3,
    observableOutcome: true,
    causalGainClaimed: false,
    temporaryFixturesDeleted: true,
  }),
);

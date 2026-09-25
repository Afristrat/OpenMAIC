import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

if (process.argv.includes('--cleanup-orphans')) {
  let deleted = 0;
  for (let page = 1; ; page++) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assert.equal(users.error, null, 'Recipe account inventory failed');
    for (const user of users.data.users) {
      if (!user.email?.startsWith('qalem-s047-') || !user.email.endsWith('@example.invalid'))
        continue;
      const memberships = await admin
        .from('org_members')
        .select('org_id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      assert.equal(memberships.error, null, 'Recipe membership lookup failed');
      if (memberships.count !== 0) continue;
      const removed = await admin.auth.admin.deleteUser(user.id);
      assert.equal(removed.error, null, 'Orphaned recipe account cleanup failed');
      deleted++;
    }
    if (users.data.users.length < 1000) break;
  }
  console.log(JSON.stringify({ orphanedRecipeAccountsDeleted: deleted }));
  process.exit(0);
}

const suffix = randomUUID();
const organizationName = `Preuve S-047 ${suffix}`;
const ownerEmail = `qalem-s047-owner-${suffix}@example.invalid`;
const learnerEmail = `qalem-s047-learner-${suffix}@example.invalid`;
const stageId = `s047-${suffix}`;
const sceneId = `quiz-${suffix}`;
const agentIds = [`mentor-${suffix}`, `coach-${suffix}`];
const discussionId = randomUUID();
const sessionId = randomUUID();

let organizationId;
let ownerId;
let userId;
let courseId;
let browser;
let context;
let accountDeleted = false;
let completed = false;

function assertResult(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
}

async function authenticatedContext() {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: learnerEmail });
  assert.ok(!link.error && link.data.properties?.hashed_token, 'Private login link unavailable');
  const client = createClient(supabaseUrl, serviceKey, options);
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  assert.ok(!login.error && login.data.session, 'Temporary account authentication failed');
  const authenticated = await browser.newContext({ serviceWorkers: 'block' });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(login.data.session)).toString('base64url')}`;
  const parts = encoded.match(/.{1,3180}/g);
  assert.ok(parts);
  await authenticated.addCookies(
    parts.map((value, index) => ({
      name: parts.length === 1 ? storageKey : `${storageKey}.${index}`,
      value,
      domain: new URL(baseUrl).hostname,
      path: '/',
      secure: true,
      sameSite: 'Lax',
    })),
  );
  return authenticated;
}

async function api(path, method = 'GET', data) {
  return context.request.fetch(`${baseUrl}${path}`, {
    method,
    headers: method === 'GET' ? undefined : { origin: baseUrl },
    ...(data === undefined ? {} : { data }),
    timeout: 60_000,
  });
}

try {
  const createdOwner = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
  });
  assert.ok(!createdOwner.error && createdOwner.data.user, 'Temporary owner creation failed');
  ownerId = createdOwner.data.user.id;
  const createdLearner = await admin.auth.admin.createUser({
    email: learnerEmail,
    email_confirm: true,
  });
  assert.ok(!createdLearner.error && createdLearner.data.user, 'Temporary learner creation failed');
  userId = createdLearner.data.user.id;

  organizationId = assertResult(
    await admin
      .from('organizations')
      .insert({
        name: organizationName,
        status: 'active',
        default_locale: 'fr-FR',
        seat_limit: 2,
      })
      .select('id')
      .single(),
    'Temporary organization creation failed',
  ).id;
  assertResult(
    await admin.from('org_members').insert([
      { org_id: organizationId, user_id: ownerId, role: 'admin' },
      { org_id: organizationId, user_id: userId, role: 'apprenant' },
    ]),
    'Temporary memberships creation failed',
  );
  assertResult(
    await admin.from('stages').insert({
      id: stageId,
      owner_id: ownerId,
      org_id: organizationId,
      name: 'Preuve S-047',
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
        title: 'Discussion et performance S-047',
        language: 'fr-FR',
        source_kind: 'generated',
        status: 'ready',
        outline: { analyticsContext: { subjectTags: ['SIPOC'] } },
      })
      .select('id')
      .single(),
    'Temporary course creation failed',
  ).id;

  browser = await chromium.launch({ headless: true });
  context = await authenticatedContext();

  const analytics = await api('/api/telemetry-consent');
  assert.equal(analytics.status(), 200, 'Contractual analytics state is unavailable');
  const analyticsState = await analytics.json();
  assert.equal(analyticsState.choice, true, 'Contractual analytics are not provisioned');
  assert.match(analyticsState.epoch, /^[0-9a-f-]{36}$/);

  const observation = {
    sessionId,
    consentEpoch: analyticsState.epoch,
    orgId: organizationId,
    stageId,
    sceneSequence: ['quiz'],
    sceneDurations: [18],
    quizScores: [],
    sceneObservations: [
      {
        id: sceneId,
        type: 'quiz',
        seconds: 18,
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
            id: `turn-question-${suffix}`,
            agentId: agentIds[0],
            interventionType: 'question',
            durationMs: 1250,
            outcome: 'completed',
          },
          {
            id: `turn-synthesis-${suffix}`,
            agentId: agentIds[1],
            interventionType: 'synthesis',
            durationMs: 2750,
            outcome: 'completed',
          },
        ],
        postDiscussionQuiz: null,
      },
    ],
    completionRate: 0,
    totalDuration: 18,
    subjectTags: [],
    language: 'fr-FR',
    level: null,
    agentCount: 2,
    actionCounts: { play: 1, pause: 0, seek: 0 },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const collected = await api('/api/learning-observations', 'POST', observation);
    assert.equal(
      collected.status(),
      200,
      `Discussion collection failed: ${await collected.text()}`,
    );
    assert.deepEqual(await collected.json(), { recorded: true });
  }

  const beforeQuiz = assertResult(
    await admin
      .from('discussion_patterns')
      .select(
        'id,subject_hash,user_hash,org_id,stage_id,discussion_id,observation,agent_sequence,intervention_types,post_discussion_quiz_score,subject_tags,language',
      )
      .eq('discussion_id', discussionId)
      .single(),
    'Persisted discussion lookup failed',
  );
  assert.equal(beforeQuiz.org_id, organizationId);
  assert.equal(beforeQuiz.stage_id, stageId);
  assert.deepEqual(beforeQuiz.agent_sequence, agentIds);
  assert.deepEqual(beforeQuiz.intervention_types, ['question', 'synthesis']);
  assert.deepEqual(
    beforeQuiz.observation.turns.map((turn) => turn.durationMs),
    [1250, 2750],
  );
  assert.deepEqual(beforeQuiz.subject_tags, ['SIPOC']);
  assert.equal(beforeQuiz.language, 'fr-FR');
  assert.equal(beforeQuiz.post_discussion_quiz_score, null);
  assert.match(beforeQuiz.subject_hash, /^[0-9a-f]{64}$/);
  assert.equal(beforeQuiz.subject_hash, beforeQuiz.user_hash);
  assert.ok(!JSON.stringify(beforeQuiz).includes(userId), 'Raw account identity leaked');

  const requestId = randomUUID();
  const submission = {
    requestId,
    orgId: organizationId,
    stageId,
    sceneId,
    answers: { q1: 'a' },
  };
  const quiz = await api('/api/quiz-attempts', 'POST', submission);
  assert.equal(quiz.status(), 200, `Native quiz failed: ${await quiz.text()}`);
  const quizBody = await quiz.json();
  assert.equal(quizBody.success, true);
  assert.equal(quizBody.status, 'completed');
  assert.equal(quizBody.score, 100);
  assert.match(quizBody.attemptId, /^[0-9a-f-]{36}$/);

  const replay = await api('/api/quiz-attempts', 'POST', submission);
  assert.equal(replay.status(), 200);
  assert.deepEqual(await replay.json(), quizBody, 'Quiz replay changed the server receipt');

  const linked = assertResult(
    await admin
      .from('classroom_quiz_attempts')
      .select('id,user_id,discussion_pattern_id,result')
      .eq('id', quizBody.attemptId)
      .single(),
    'Quiz linkage lookup failed',
  );
  assert.equal(linked.user_id, userId);
  assert.equal(linked.discussion_pattern_id, beforeQuiz.id);
  assert.equal(linked.result.score, 100);
  const scored = assertResult(
    await admin
      .from('discussion_patterns')
      .select('post_discussion_quiz_score')
      .eq('id', beforeQuiz.id)
      .single(),
    'Discussion score lookup failed',
  );
  assert.equal(scored.post_discussion_quiz_score, 1);

  const aggregate = assertResult(
    await admin.rpc('read_authorized_discussion_patterns', {
      p_actor: userId,
      p_org: organizationId,
      p_stages: [stageId],
      p_subject: 'SIPOC',
      p_language: 'fr-FR',
    }),
    'Authorized aggregate lookup failed',
  );
  assert.deepEqual(aggregate, [
    {
      agent_sequence: agentIds,
      intervention_types: ['question', 'synthesis'],
      post_discussion_quiz_score: 1,
    },
  ]);
  const forbidden = await admin.rpc('read_authorized_discussion_patterns', {
    p_actor: randomUUID(),
    p_org: organizationId,
    p_stages: [stageId],
    p_subject: 'SIPOC',
    p_language: 'fr-FR',
  });
  assert.ok(forbidden.error, 'An unrelated identity accessed tenant aggregates');

  const exported = await api('/api/account/export');
  assert.equal(exported.status(), 200, `Personal export failed: ${await exported.text()}`);
  const exportBody = await exported.json();
  assert.equal(exportBody.complete, true);
  assert.equal(exportBody.discussion_patterns.length, 1);
  assert.equal(exportBody.classroom_quiz_attempts.length, 1);
  assert.equal(exportBody.discussion_patterns[0].discussion_id, discussionId);
  assert.equal(exportBody.discussion_patterns[0].quiz_attempt_id, quizBody.attemptId);
  assert.equal(exportBody.discussion_patterns[0].post_discussion_quiz_score, 1);
  assert.equal(exportBody.classroom_quiz_attempts[0].discussion_pattern_id, beforeQuiz.id);

  const deletion = await api('/api/account/delete', 'DELETE');
  assert.equal(deletion.status(), 200, `Account deletion failed: ${await deletion.text()}`);
  assert.deepEqual(await deletion.json(), { success: true, accountDeleted: true });
  accountDeleted = true;

  const authLookup = await admin.auth.admin.getUserById(userId);
  assert.ok(authLookup.error && !authLookup.data.user, 'Deleted Auth identity is still readable');
  for (const [table, column, value] of [
    ['discussion_patterns', 'discussion_id', discussionId],
    ['classroom_quiz_attempts', 'id', quizBody.attemptId],
    ['pedagogy_telemetry', 'session_id', sessionId],
  ]) {
    const remaining = await admin
      .from(table)
      .select(column, { count: 'exact', head: true })
      .eq(column, value);
    assert.equal(remaining.error, null, `${table} cleanup lookup failed`);
    assert.equal(remaining.count, 0, `${table} retained deleted account data`);
  }
  completed = true;
} finally {
  await context?.close();
  await browser?.close();
  if (userId && !accountDeleted) await admin.auth.admin.deleteUser(userId);
  if (courseId) await admin.from('courses').delete().eq('id', courseId);
  await admin.from('scenes').delete().eq('stage_id', stageId);
  await admin.from('stages').delete().eq('id', stageId);
  if (organizationId) await admin.from('organizations').delete().eq('id', organizationId);
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
}

assert.ok(completed);
for (const [table, column, value] of [
  ['organizations', 'name', organizationName],
  ['stages', 'id', stageId],
  ['scenes', 'stage_id', stageId],
  ['courses', 'id', courseId],
  ['discussion_patterns', 'discussion_id', discussionId],
  ['pedagogy_telemetry', 'session_id', sessionId],
]) {
  const remaining = await admin
    .from(table)
    .select(column, { count: 'exact', head: true })
    .eq(column, value);
  assert.equal(remaining.error, null, `${table} final cleanup lookup failed`);
  assert.equal(remaining.count, 0, `${table} final cleanup retained fixtures`);
}

console.log(
  JSON.stringify({
    contractualAnalytics: true,
    idempotentDiscussion: true,
    exactSequenceTypesAndDurations: true,
    pseudonymized: true,
    nativeQuizScore: 1,
    discussionQuizLinked: true,
    authorizedAggregateRows: 1,
    foreignAggregateDenied: true,
    personalExportComplete: true,
    accountDeletionRemovedEvidence: true,
    temporaryFixturesDeleted: true,
  }),
);

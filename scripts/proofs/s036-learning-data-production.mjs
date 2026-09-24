import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { supabaseUrl, serviceKey, baseUrl = 'https://qalem.ma' } = JSON.parse(input);
input = '';

assert.equal(new URL(baseUrl).origin, 'https://qalem.ma');
assert.equal(new URL(supabaseUrl).origin, 'https://db.qalem.ma');
assert.ok(serviceKey, 'Production service credential is required');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, options);
const suffix = randomUUID();
const organizationName = `Preuve S-036 ${suffix}`;
const adminEmail = `qalem-s036-admin-${suffix}@example.invalid`;
const learnerEmail = `qalem-s036-learner-${suffix}@example.invalid`;
const stageId = `s036-${suffix}`;
const slideId = `slide-${suffix}`;
const quizId = `quiz-${suffix}`;
const agentId = `s036-agent-${suffix}`;

let organizationId;
let adminId;
let learnerId;
let browser;
let adminContext;
let learnerContext;
let learnerDeleted = false;
let completed = false;

function assertResult(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
}

async function authenticatedContext(email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(!link.error && link.data.properties?.hashed_token, `Login link unavailable for ${email}`);
  const client = createClient(supabaseUrl, serviceKey, options);
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  assert.ok(!login.error && login.data.session, `Authentication failed for ${email}`);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(login.data.session)).toString('base64url')}`;
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
  return context;
}

async function api(context, path, method = 'GET', data) {
  return context.request.fetch(`${baseUrl}${path}`, {
    method,
    headers: method === 'GET' ? undefined : { origin: baseUrl },
    ...(data === undefined ? {} : { data }),
    timeout: 30_000,
  });
}

try {
  const createdAdmin = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
  });
  assert.ok(!createdAdmin.error && createdAdmin.data.user, 'Temporary administrator creation failed');
  adminId = createdAdmin.data.user.id;

  const createdLearner = await admin.auth.admin.createUser({
    email: learnerEmail,
    email_confirm: true,
  });
  assert.ok(!createdLearner.error && createdLearner.data.user, 'Temporary learner creation failed');
  learnerId = createdLearner.data.user.id;

  organizationId = assertResult(
    await admin
      .from('organizations')
      .insert({ name: organizationName, status: 'active', default_locale: 'fr-FR' })
      .select('id')
      .single(),
    'Temporary organization creation failed',
  ).id;

  assertResult(
    await admin.from('org_members').insert([
      { org_id: organizationId, user_id: adminId, role: 'admin' },
      { org_id: organizationId, user_id: learnerId, role: 'apprenant' },
    ]),
    'Temporary memberships creation failed',
  );
  assertResult(
    await admin
      .from('stages')
      .insert({ id: stageId, owner_id: adminId, org_id: organizationId, name: 'Preuve S-036' }),
    'Temporary classroom creation failed',
  );
  assertResult(
    await admin.from('scenes').insert([
      { id: slideId, stage_id: stageId, type: 'slide', order: 0 },
      { id: quizId, stage_id: stageId, type: 'quiz', order: 1 },
    ]),
    'Temporary scenes creation failed',
  );
  assertResult(
    await admin.from('agent_configs').insert({
      id: agentId,
      owner_id: learnerId,
      org_id: organizationId,
      name: 'Agent privé S-036',
      role: 'teacher',
      persona: 'Preuve de reprise administrative',
      is_published: false,
    }),
    'Temporary private agent creation failed',
  );

  browser = await chromium.launch({ headless: true });
  adminContext = await authenticatedContext(adminEmail);
  learnerContext = await authenticatedContext(learnerEmail);

  const consent = await api(learnerContext, '/api/telemetry-consent');
  assert.equal(consent.status(), 200, 'Contractual analytics state is unreadable');
  const consentState = await consent.json();
  assert.equal(consentState.choice, true, 'Contractual analytics are not provisioned');
  assert.match(consentState.epoch, /^[0-9a-f-]{36}$/);

  const sessionId = randomUUID();
  const observation = {
    sessionId,
    consentEpoch: consentState.epoch,
    orgId: organizationId,
    stageId,
    sceneSequence: ['slide', 'quiz'],
    sceneDurations: [12, 8],
    quizScores: [0.6, 0.8],
    sceneObservations: [
      { id: slideId, type: 'slide', seconds: 12, completed: true, score: null },
      {
        id: quizId,
        type: 'quiz',
        seconds: 8,
        completed: true,
        score: 0.8,
        attempts: [0.6, 0.8],
      },
    ],
    completionRate: 0.75,
    totalDuration: 20,
    subjectTags: [],
    language: 'fr-FR',
    level: 'beginner',
    agentCount: 2,
    actionCounts: { play: 1, pause: 1, seek: 1 },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await api(learnerContext, '/api/learning-observations', 'POST', observation);
    assert.equal(response.status(), 200, `Learning observation failed: ${await response.text()}`);
    assert.deepEqual(await response.json(), { recorded: true });
  }

  const rows = assertResult(
    await admin
      .from('pedagogy_telemetry')
      .select('id,user_hash,subject_hash,session_id,org_id,stage_id,completion_rate,total_duration')
      .eq('session_id', sessionId),
    'Learning observation lookup failed',
  );
  assert.equal(rows.length, 1, 'Idempotent replay created duplicate observations');
  assert.equal(rows[0].org_id, organizationId);
  assert.equal(rows[0].stage_id, stageId);
  assert.equal(rows[0].completion_rate, 0.75);
  assert.equal(rows[0].total_duration, 20);
  assert.match(rows[0].subject_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(rows[0]).includes(learnerId), 'Raw learner identity leaked into telemetry');

  assertResult(
    await admin.from('quiz_results').insert({
      user_id: learnerId,
      org_id: organizationId,
      stage_id: stageId,
      scene_id: quizId,
      answers: {},
      score: 0.8,
    }),
    'Temporary quiz result creation failed',
  );

  const learnerReport = await api(
    learnerContext,
    `/api/organizations/${organizationId}/reports`,
  );
  assert.equal(learnerReport.status(), 403, 'Learner accessed organization aggregates');

  const report = await api(adminContext, `/api/organizations/${organizationId}/reports`);
  assert.equal(report.status(), 200, `Organization report failed: ${await report.text()}`);
  const reportBody = await report.json();
  assert.equal(reportBody.success, true);
  assert.equal(reportBody.coverage.learningObservations, 1);
  assert.equal(reportBody.coverage.quizResults, 1);
  assert.equal(reportBody.metrics.totalLearners, 1);
  assert.equal(reportBody.metrics.activeClassrooms, 1);
  assert.equal(reportBody.metrics.avgScore, 0.8);
  assert.equal(reportBody.metrics.completionRate, 75);

  const exported = await api(learnerContext, '/api/account/export');
  assert.equal(exported.status(), 200, `Personal export failed: ${await exported.text()}`);
  assert.match(exported.headers()['content-disposition'] ?? '', /^attachment;/);
  const exportBody = await exported.json();
  assert.equal(exportBody.complete, true);
  assert.equal(exportBody.includedSections.length, 57);
  assert.equal(exportBody.pedagogy_telemetry.length, 1);
  assert.equal(exportBody.pedagogy_telemetry[0].session_id, sessionId);
  assert.ok(
    !JSON.stringify(exportBody.pedagogy_telemetry[0]).includes(learnerId),
    'Personal observation export contains the raw learner identity',
  );

  const deletion = await api(learnerContext, '/api/account/delete', 'DELETE');
  assert.equal(deletion.status(), 200, `Account deletion failed: ${await deletion.text()}`);
  assert.deepEqual(await deletion.json(), { success: true, accountDeleted: true });
  learnerDeleted = true;

  const authLookup = await admin.auth.admin.getUserById(learnerId);
  assert.ok(authLookup.error && !authLookup.data.user, 'Deleted Auth identity is still readable');
  for (const [table, column] of [
    ['profiles', 'id'],
    ['telemetry_consent', 'user_id'],
    ['org_members', 'user_id'],
  ]) {
    const result = await admin.from(table).select(column, { count: 'exact', head: true }).eq(column, learnerId);
    assert.equal(result.error, null, `${table} cleanup lookup failed`);
    assert.equal(result.count, 0, `${table} retained deleted account data`);
  }
  const observationsAfterDelete = await admin
    .from('pedagogy_telemetry')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  assert.equal(observationsAfterDelete.error, null);
  assert.equal(observationsAfterDelete.count, 0, 'Learning observation survived account deletion');

  const recoverable = await api(
    adminContext,
    `/api/marketplace/agents/recoverable?orgId=${organizationId}`,
  );
  assert.equal(recoverable.status(), 200, `Recoverable agent lookup failed: ${await recoverable.text()}`);
  const recoverableBody = await recoverable.json();
  assert.ok(
    recoverableBody.agents.some((agent) => agent.id === agentId),
    'Detached tenant agent is not recoverable',
  );
  const reclaimed = await api(adminContext, '/api/marketplace/agents/recoverable', 'POST', {
    orgId: organizationId,
    agentId,
  });
  assert.equal(reclaimed.status(), 200, `Agent reclaim failed: ${await reclaimed.text()}`);
  assert.deepEqual(await reclaimed.json(), { success: true, reclaimed: true, agentId });
  const agent = assertResult(
    await admin
      .from('agent_configs')
      .select('owner_id,tenant_reclaim_pending,persona')
      .eq('id', agentId)
      .single(),
    'Reclaimed agent lookup failed',
  );
  assert.equal(agent.owner_id, adminId);
  assert.equal(agent.tenant_reclaim_pending, false);
  assert.equal(agent.persona, 'Preuve de reprise administrative');
  const audits = await admin
    .from('tenant_admin_audit')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', organizationId)
    .eq('action', 'agent_ownership_reclaimed');
  assert.equal(audits.error, null);
  assert.equal(audits.count, 1, 'Agent reclaim audit is missing or duplicated');

  completed = true;
} finally {
  await learnerContext?.close();
  await adminContext?.close();
  await browser?.close();
  if (organizationId) {
    const removedOrganization = await admin.from('organizations').delete().eq('id', organizationId);
    assert.equal(removedOrganization.error, null, 'Temporary organization cleanup failed');
  }
  if (learnerId && !learnerDeleted) {
    const removedLearner = await admin.auth.admin.deleteUser(learnerId);
    assert.ok(!removedLearner.error, 'Temporary learner cleanup failed');
  }
  if (adminId) {
    const removedAdmin = await admin.auth.admin.deleteUser(adminId);
    assert.ok(!removedAdmin.error, 'Temporary administrator cleanup failed');
  }
}

assert.ok(completed, 'S-036 production proof did not complete');
console.log(
  JSON.stringify({
    contractualAnalyticsProvisioned: true,
    idempotentObservationStorage: true,
    pseudonymousObservation: true,
    tenantAggregateAuthorizedByRole: true,
    personalExportSections: 57,
    accountDeletionCascaded: true,
    privateTenantAgentRecovered: true,
    agentRecoveryAudited: true,
    temporaryFixturesDeleted: true,
  }),
);

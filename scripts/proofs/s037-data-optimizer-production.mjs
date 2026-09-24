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

const marker = randomUUID();
const adminEmail = `qalem-s037-admin-${marker}@example.invalid`;
const learnerEmail = `qalem-s037-learner-${marker}@example.invalid`;
const stageId = `s037-${marker}`;
const slideId = `s037-slide-${marker}`;
const interactiveId = `s037-interactive-${marker}`;
const quizId = `s037-quiz-${marker}`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceKey, options);

let organizationId;
let authorId;
let learnerId;
let browser;
let context;

function value(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
}

async function authenticatedContext(email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ok(!link.error && link.data.properties?.hashed_token, `Login link unavailable: ${email}`);
  const client = createClient(supabaseUrl, serviceKey, options);
  const login = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  assert.ok(!login.error && login.data.session, `Authentication failed: ${email}`);
  const result = await browser.newContext({ serviceWorkers: 'block' });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(login.data.session)).toString('base64url')}`;
  const parts = encoded.match(/.{1,3180}/g);
  await result.addCookies(
    parts.map((part, index) => ({
      name: parts.length === 1 ? storageKey : `${storageKey}.${index}`,
      value: part,
      domain: new URL(baseUrl).hostname,
      path: '/',
      secure: true,
      sameSite: 'Lax',
    })),
  );
  return result;
}

async function createPlan(label) {
  const response = await context.request.post(`${baseUrl}/api/generate-classroom/plan`, {
    headers: { origin: baseUrl },
    data: {
      orgId: organizationId,
      requirement: [
        'Crée exactement deux scènes de formation pour adultes professionnels sur la conduite du changement.',
        'La seconde scène doit être un quiz final.',
        'Choisis la forme et l’ordre de la première scène selon les éléments d’apprentissage disponibles, sans inventer de résultats.',
      ].join(' '),
      language: 'fr-FR',
      learningApproach: 'andragogy',
      interactionLevel: 'balanced',
      learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
      enableWebSearch: false,
      enableImageGeneration: false,
      enableVideoGeneration: false,
      enableTTS: false,
      interactiveMode: true,
      agentMode: 'default',
      selectedPersonaIds: ['professor', 'teaching-assistant'],
      activeSkillId: 'formation-design-pro',
    },
    timeout: 60_000,
  });
  const created = await response.json();
  assert.equal(response.status(), 202, `${label}: plan creation returned ${response.status()}`);
  const jobId = created.jobId ?? created.data?.jobId;
  assert.ok(jobId, `${label}: plan job id missing`);
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const polled = await context.request.get(
      `${baseUrl}/api/generate-classroom/plan/${encodeURIComponent(jobId)}`,
      { timeout: 60_000 },
    );
    const body = await polled.json();
    assert.equal(polled.status(), 200, `${label}: plan poll returned ${polled.status()}`);
    const payload = body.data ?? body;
    if (payload.status === 'failed')
      throw new Error(`${label}: ${payload.error ?? payload.message}`);
    if (payload.status === 'succeeded') {
      const result = payload.result;
      assert.ok(result && Array.isArray(result.outlines), `${label}: plan result missing`);
      return {
        jobId,
        optimization: result.optimization ?? null,
        sceneTypes: result.outlines.map((outline) => outline.type),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`${label}: plan timeout`);
}

async function recordObservation(sequence, score) {
  const consent = value(
    await admin
      .from('telemetry_consent')
      .select('collection_epoch')
      .eq('user_id', learnerId)
      .single(),
    'Consent epoch lookup failed',
  );
  const recorded = value(
    await admin.rpc('record_consented_learning', {
      p_actor: learnerId,
      p_session: randomUUID(),
      p_stage: stageId,
      p_payload: {
        scene_sequence: sequence,
        scene_durations: sequence.map(() => 60),
        quiz_scores: [score],
        completion_rate: 1,
        total_duration: sequence.length * 60,
        action_counts: { play: 1 },
      },
      p_epoch: consent.collection_epoch,
      p_org: organizationId,
    }),
    'Observation recording failed',
  );
  assert.equal(recorded, true, 'Observation was not accepted');
}

try {
  const createdAuthor = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
  });
  assert.ok(!createdAuthor.error && createdAuthor.data.user, 'Author creation failed');
  authorId = createdAuthor.data.user.id;
  const createdLearner = await admin.auth.admin.createUser({
    email: learnerEmail,
    email_confirm: true,
  });
  assert.ok(!createdLearner.error && createdLearner.data.user, 'Learner creation failed');
  learnerId = createdLearner.data.user.id;

  organizationId = value(
    await admin
      .from('organizations')
      .insert({
        name: `Preuve S-037 ${marker}`,
        status: 'active',
        default_locale: 'fr-FR',
        seat_limit: 2,
      })
      .select('id')
      .single(),
    'Organization creation failed',
  ).id;
  value(
    await admin.from('org_members').insert([
      { org_id: organizationId, user_id: authorId, role: 'admin' },
      { org_id: organizationId, user_id: learnerId, role: 'apprenant' },
    ]),
    'Membership creation failed',
  );
  value(
    await admin.rpc('post_tenant_credit_entry', {
      actor_user_id: authorId,
      tenant_id: organizationId,
      credit_entry_type: 'allocation',
      credit_delta_microunits: 100_000_000,
      credit_idempotency_key: `${marker}-allocation`,
      credit_reason: 'Allocation jetable pour la recette S-037',
    }),
    'Credit allocation failed',
  );
  value(
    await admin.from('stages').insert({
      id: stageId,
      owner_id: authorId,
      org_id: organizationId,
      name: 'Historique S-037',
      agent_ids: [],
    }),
    'Stage creation failed',
  );
  value(
    await admin.from('scenes').insert([
      { id: slideId, stage_id: stageId, type: 'slide', order: 0 },
      { id: interactiveId, stage_id: stageId, type: 'interactive', order: 1 },
      { id: quizId, stage_id: stageId, type: 'quiz', order: 2 },
    ]),
    'Scene creation failed',
  );
  value(
    await admin.from('courses').insert({
      owner_id: authorId,
      org_id: organizationId,
      stage_id: stageId,
      title: 'Historique S-037',
      language: 'fr-FR',
      source_kind: 'generated',
      status: 'ready',
      outline: {
        analyticsContext: {
          level: 'beginner',
          subjectTags: ['formation-design-pro'],
        },
      },
    }),
    'Course creation failed',
  );

  browser = await chromium.launch({ headless: true });
  context = await authenticatedContext(adminEmail);

  const zero = await createPlan('zero observations');
  assert.equal(zero.optimization, null, 'Zero observations must not fabricate advice');

  await recordObservation(['slide', 'quiz'], 0.4);
  const one = await createPlan('one observation');
  assert.equal(one.optimization?.sampleSize, 1, 'The first usable observation was ignored');
  assert.deepEqual(one.optimization?.recommendedSceneOrder, ['slide', 'quiz']);
  assert.equal(one.optimization?.difficultyModifier, -0.2);

  await recordObservation(['interactive', 'quiz'], 0.9);
  await recordObservation(['interactive', 'quiz'], 0.95);
  const multiple = await createPlan('multiple observations');
  assert.equal(multiple.optimization?.sampleSize, 3, 'Multiple observations were not aggregated');
  assert.deepEqual(multiple.optimization?.recommendedSceneOrder, ['interactive', 'quiz']);
  assert.equal(multiple.optimization?.selectedSequenceSampleSize, 2);

  const beforeDeletion = await admin
    .from('pedagogy_telemetry')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', organizationId);
  assert.equal(beforeDeletion.error, null);
  assert.equal(beforeDeletion.count, 3, 'Expected three observations before withdrawal');
  const deleted = await admin.auth.admin.deleteUser(learnerId);
  assert.equal(deleted.error, null, `Learner deletion failed: ${deleted.error?.message}`);
  const countCheck = await admin
    .from('pedagogy_telemetry')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', organizationId);
  assert.equal(countCheck.error, null);
  assert.equal(countCheck.count, 0, 'Account deletion did not withdraw optimization evidence');
  learnerId = undefined;

  console.log(
    JSON.stringify({
      zero: { optimization: false, sceneTypes: zero.sceneTypes },
      one: {
        sampleSize: one.optimization.sampleSize,
        recommendation: one.optimization.recommendedSceneOrder,
        difficultyModifier: one.optimization.difficultyModifier,
        sceneTypes: one.sceneTypes,
      },
      multiple: {
        sampleSize: multiple.optimization.sampleSize,
        selectedSequenceSampleSize: multiple.optimization.selectedSequenceSampleSize,
        recommendation: multiple.optimization.recommendedSceneOrder,
        difficultyModifier: multiple.optimization.difficultyModifier,
        sceneTypes: multiple.sceneTypes,
        recommendationApplied:
          JSON.stringify(multiple.sceneTypes) ===
          JSON.stringify(multiple.optimization.recommendedSceneOrder),
      },
      withdrawalRemovedEvidence: true,
    }),
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (organizationId) {
    await admin.from('classroom_generation_jobs').delete().eq('org_id', organizationId);
    await admin.from('organizations').delete().eq('id', organizationId);
  }
  if (learnerId) await admin.auth.admin.deleteUser(learnerId).catch(() => undefined);
  if (authorId) await admin.auth.admin.deleteUser(authorId).catch(() => undefined);
}

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const base = process.env.QALEM_PROOF_BASE_URL ?? 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(new URL(base).hostname, 'qalem.ma', 'Proof target must remain Qalem production');
assert(supabaseUrl && anon && service, 'Missing private proof configuration');

const marker = `s025-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const userIds = [];
let organizationId;
let classroomId;
let stage = 'initialisation';

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // The proof emits only checked statuses and counters, never response bodies.
  }
  return { status: response.status, payload, headers: response.headers };
}

function headers(withBody = false) {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function createSession() {
  const email = `${marker}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  stage = 'création-compte';
  const created = await json(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200);
  assert(typeof created.payload?.id === 'string');
  userIds.push(created.payload.id);

  stage = 'connexion';
  const signed = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signed.status, 200);
  assert(typeof signed.payload?.access_token === 'string');
  assert(typeof signed.payload?.refresh_token === 'string');
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(signed.payload)).toString('base64url')}`;
  return {
    userId: created.payload.id,
    accessToken: signed.payload.access_token,
    cookie: {
      name: key,
      value: encoded,
      domain: new URL(base).hostname,
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
    requestHeaders: {
      origin: base,
      cookie: `${key}=${encoded}`,
      'Content-Type': 'application/json',
    },
  };
}

async function createOrganization(userId) {
  stage = 'création-organisation';
  const organization = await json(`${supabaseUrl}/rest/v1/organizations`, {
    method: 'POST',
    headers: { ...headers(true), Prefer: 'return=representation' },
    body: JSON.stringify({
      name: `S-025 ${marker}`,
      default_locale: 'fr-FR',
      status: 'active',
      seat_limit: 1,
    }),
  });
  assert.equal(organization.status, 201);
  assert(typeof organization.payload?.[0]?.id === 'string');
  organizationId = organization.payload[0].id;
  const membership = await json(`${supabaseUrl}/rest/v1/org_members`, {
    method: 'POST',
    headers: { ...headers(true), Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, org_id: organizationId, role: 'author' }),
  });
  assert.equal(membership.status, 201);
}

async function createQuizClassroom(session) {
  stage = 'création-classroom';
  classroomId = `${marker}-quiz`.replace(/[^A-Za-z0-9_-]/g, '_');
  const now = Date.now();
  const result = await json(`${base}/api/classroom`, {
    method: 'POST',
    headers: session.requestHeaders,
    body: JSON.stringify({
      orgId: organizationId,
      stage: {
        id: classroomId,
        name: 'Recette quiz S-025',
        description: 'Fixture temporaire de persistance des cartes de révision.',
        createdAt: now,
        updatedAt: now,
        language: 'fr-FR',
        style: 'professional',
      },
      scenes: [
        {
          id: `${classroomId}-scene`,
          stageId: classroomId,
          type: 'quiz',
          title: 'Quiz de révision',
          order: 0,
          content: {
            type: 'quiz',
            questions: [
              {
                id: `${classroomId}-wrong`,
                type: 'single',
                question: 'Quel choix est correct dans le cas de recette ?',
                options: [
                  { label: 'Option incorrecte', value: 'A' },
                  { label: 'Option correcte', value: 'B' },
                ],
                answer: ['B'],
                analysis: 'L’option B est la réponse de référence.',
                hasAnswer: true,
                points: 1,
              },
              {
                id: `${classroomId}-partial`,
                type: 'multiple',
                question: 'Quels deux éléments sont requis pour cette preuve ?',
                options: [
                  { label: 'Une recette authentifiée', value: 'A' },
                  { label: 'Un rechargement de la page de révision', value: 'B' },
                  { label: 'Une copie d’écran seule', value: 'C' },
                ],
                answer: ['A', 'B'],
                analysis: 'Les éléments A et B sont requis.',
                hasAnswer: true,
                points: 1,
              },
            ],
          },
          actions: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    }),
  });
  assert.equal(result.status, 201);
  assert.equal(result.payload?.id, classroomId);
}

async function count(table, query) {
  const response = await json(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { ...headers(), Prefer: 'count=exact', Range: '0-0' },
  });
  assert.equal(response.status, 200);
  const range = response.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  assert(Number.isInteger(total), `Missing exact count for ${table}`);
  return total;
}

async function deleteClassroom(session) {
  if (!classroomId) return;
  const result = await json(`${base}/api/classroom?id=${encodeURIComponent(classroomId)}`, {
    method: 'DELETE',
    headers: { origin: base, cookie: session.requestHeaders.cookie },
  });
  assert([200, 204, 404].includes(result.status));
  classroomId = undefined;
}

async function cleanup(session) {
  if (classroomId) await deleteClassroom(session);
  if (organizationId) {
    const result = await json(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`,
      { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } },
    );
    assert([200, 204].includes(result.status));
    organizationId = undefined;
  }
  for (const userId of userIds.splice(0)) {
    const result = await json(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    assert([200, 204, 404].includes(result.status));
  }
}

let browser;
let session;
let uiDiagnostic = {};
try {
  session = await createSession();
  await createOrganization(session.userId);
  await createQuizClassroom(session);
  const persistedStageId = classroomId;
  const membershipProbe = await json(
    `${supabaseUrl}/rest/v1/org_members?select=role,organizations!inner(status)&org_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(session.userId)}`,
    { headers: { apikey: anon, Authorization: `Bearer ${session.accessToken}` } },
  );
  const publicShareProbe = await json(
    `${supabaseUrl}/rest/v1/shared_classrooms?select=id,organizations!inner(status)&stage_id=eq.${encodeURIComponent(persistedStageId)}&visibility=eq.public&authorization_verified=eq.true`,
    { headers: headers() },
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addCookies([session.cookie]);
  const page = await context.newPage();
  stage = 'chargement-classroom';
  const classroomResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/classroom' &&
      response.request().method() === 'GET',
    { timeout: 30_000 },
  );
  await page.goto(`${base}/classroom/${encodeURIComponent(classroomId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const classroomApi = await classroomResponse;
  uiDiagnostic = {
    pathname: new URL(page.url()).pathname,
    classroomStatus: classroomApi.status(),
    membershipStatus: membershipProbe.status,
    publicShareStatus: publicShareProbe.status,
    authFormVisible: await page.getByLabel('Adresse e-mail', { exact: true }).isVisible(),
    sessionCookieCount: (await context.cookies(base)).filter((cookie) =>
      cookie.name.includes('-auth-token'),
    ).length,
  };
  assert.equal(classroomApi.status(), 200, 'Authenticated classroom API must succeed');
  await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 30_000 });
  const start = page.getByRole('button', { name: 'Démarrer le quiz', exact: true });
  await start.waitFor({ state: 'visible', timeout: 30_000 });
  await start.click();
  const submit = page.getByRole('button', { name: 'Soumettre les réponses', exact: true });
  await submit.waitFor({ state: 'visible', timeout: 30_000 });
  await page
    .getByRole('group', { name: 'Quel choix est correct dans le cas de recette ?', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('group', {
      name: 'Quels deux éléments sont requis pour cette preuve ?',
      exact: true,
    })
    .getByRole('button')
    .first()
    .click();
  stage = 'soumission-quiz';
  await submit.click();
  await page.getByText('0%', { exact: true }).waitFor({ timeout: 30_000 });
  const cardQuery = `select=id&user_id=eq.${encodeURIComponent(session.userId)}&source_stage_id=eq.${encodeURIComponent(persistedStageId)}`;
  const resultQuery = `select=id&user_id=eq.${encodeURIComponent(session.userId)}&stage_id=eq.${encodeURIComponent(persistedStageId)}`;
  let cardCount = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    cardCount = await count('review_cards', cardQuery);
    if (cardCount === 2) break;
    await page.waitForTimeout(250);
  }
  assert.equal(cardCount, 2, 'Wrong and hesitant answers must create two cards');
  assert.equal(await count('quiz_results', resultQuery), 1);
  stage = 'idempotence';
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByRole('button', { name: 'Démarrer le quiz', exact: true }).click();
  await page
    .getByRole('group', { name: 'Quel choix est correct dans le cas de recette ?', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page
    .getByRole('group', {
      name: 'Quels deux éléments sont requis pour cette preuve ?',
      exact: true,
    })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: 'Soumettre les réponses', exact: true }).click();
  await page.getByText('0%', { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await count('review_cards', cardQuery), 2, 'Repeat must not duplicate cards');
  assert.equal(
    await count('quiz_results', resultQuery),
    1,
    'Repeat must not duplicate quiz result',
  );
  stage = 'rechargement-révision';
  await page.goto(`${base}/review`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page
    .getByText('Quel choix est correct dans le cas de recette ?', { exact: true })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page
    .getByText('Quel choix est correct dans le cas de recette ?', { exact: true })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await cleanup(session);
  const remainingCards = await count(
    'review_cards',
    `select=id&source_stage_id=eq.${encodeURIComponent(persistedStageId)}`,
  );
  const remainingResults = await count(
    'quiz_results',
    `select=id&stage_id=eq.${encodeURIComponent(persistedStageId)}`,
  );
  assert.equal(remainingCards, 0, 'Cleanup must remove temporary review cards');
  assert.equal(remainingResults, 0, 'Cleanup must remove temporary quiz result');
  console.log(
    JSON.stringify({
      quizScorePercent: 0,
      wrongAndHesitantCards: cardCount,
      idempotentCards: 2,
      idempotentResults: 1,
      reviewReloaded: true,
      cleanup: { cards: remainingCards, results: remainingResults },
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      stage,
      error: error instanceof Error ? error.name : 'PROOF_FAILURE',
      uiDiagnostic,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (session) await cleanup(session).catch(() => undefined);
}

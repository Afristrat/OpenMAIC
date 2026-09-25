import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const required = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variable requise absente : ${name}`);
}
if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S6-032-CLASSROOM-DELEGATION') {
  throw new Error('Confirmation de recette de production absente');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://db.qalem.ma';
const appUrl = process.env.QALEM_APP_URL ?? 'https://qalem.ma';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const marker = `s6032-${Date.now()}-${randomUUID()}`;
const organizationId = randomUUID();
const editableStageId = `${marker}-editable`;
const isolatedStageId = `${marker}-isolated`;
const password = randomBytes(32).toString('base64url');
const managerEmail = `${marker}-manager@example.invalid`;
const trainerEmail = `${marker}-trainer@example.invalid`;
let managerId = null;
let trainerId = null;

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function request(url, init, label, expectedStatuses = [200]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  assert.ok(
    expectedStatuses.includes(response.status),
    `${label}: HTTP ${response.status}, ${JSON.stringify(body)}`,
  );
  return { response, body };
}

function sessionCookieValue(session) {
  return `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
    }),
    'utf8',
  ).toString('base64url')}`;
}

function sessionCookie(session) {
  return `sb-db-auth-token=${sessionCookieValue(session)}`;
}

async function authenticatedPage(browser, session) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'sb-db-auth-token',
      value: sessionCookieValue(session),
      domain: 'qalem.ma',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  return { context, page: await context.newPage() };
}

async function createUser(email, nickname) {
  const { body } = await request(
    `${supabaseUrl}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nickname },
      }),
    },
    `Création de ${nickname}`,
    [200, 201],
  );
  assert.equal(typeof body?.id, 'string', `Identifiant absent pour ${nickname}`);
  return body.id;
}

async function signIn(email) {
  const { body } = await request(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    `Connexion de ${email}`,
  );
  assert.ok(body?.access_token && body?.refresh_token, `Session absente pour ${email}`);
  return body;
}

async function restInsert(table, payload, label) {
  await request(
    `${supabaseUrl}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: { ...serviceHeaders, prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    },
    label,
    [201],
  );
}

async function classroomAccess(stageId, cookie, init, label, expectedStatuses = [200]) {
  return request(
    `${appUrl}/api/classroom/${encodeURIComponent(stageId)}/edit-access`,
    {
      ...init,
      headers: {
        cookie,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
      },
    },
    label,
    expectedStatuses,
  );
}

async function renameClassroom(stageId, cookie, name, expectedStatus) {
  return request(
    `${appUrl}/api/classroom?id=${encodeURIComponent(stageId)}`,
    {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    `Renommage de ${stageId}`,
    [expectedStatus],
  );
}

async function cleanup() {
  for (const path of [
    `stages?org_id=eq.${encodeURIComponent(organizationId)}`,
    `organizations?id=eq.${encodeURIComponent(organizationId)}`,
  ]) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method: 'DELETE',
      headers: serviceHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Nettoyage REST impossible : ${path} (HTTP ${response.status})`);
    }
  }
  for (const userId of [trainerId, managerId]) {
    if (!userId) continue;
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: serviceHeaders,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`Suppression Auth impossible : HTTP ${response.status}`);
  }
}

try {
  managerId = await createUser(managerEmail, 'Manager S6-032');
  trainerId = await createUser(trainerEmail, 'Formateur S6-032');
  await restInsert(
    'organizations',
    {
      id: organizationId,
      name: `Preuve S6-032 ${marker}`,
      status: 'active',
      seat_limit: 2,
      default_locale: 'fr-FR',
    },
    'Création du tenant de recette',
  );
  await restInsert(
    'org_members',
    [
      { org_id: organizationId, user_id: managerId, role: 'manager' },
      { org_id: organizationId, user_id: trainerId, role: 'formateur' },
    ],
    'Création des appartenances de recette',
  );
  await restInsert(
    'stages',
    [
      {
        id: editableStageId,
        owner_id: managerId,
        org_id: organizationId,
        name: 'Formation déléguée S6-032',
      },
      {
        id: isolatedStageId,
        owner_id: managerId,
        org_id: organizationId,
        name: 'Formation isolée S6-032',
      },
    ],
    'Création des formations de recette',
  );

  const [managerSession, trainerSession] = await Promise.all([
    signIn(managerEmail),
    signIn(trainerEmail),
  ]);
  const managerCookie = sessionCookie(managerSession);
  const trainerCookie = sessionCookie(trainerSession);

  await renameClassroom(editableStageId, trainerCookie, 'Modification prématurée', 403);
  const browser = await chromium.launch({ headless: true });
  let requestId;
  let approvedExpiresAt;
  try {
    const trainerBrowser = await authenticatedPage(browser, trainerSession);
    const managerBrowser = await authenticatedPage(browser, managerSession);
    try {
      await trainerBrowser.page.goto(`${appUrl}/classroom/${editableStageId}`, {
        waitUntil: 'domcontentloaded',
      });
      await trainerBrowser.page.getByRole('button', { name: 'Demander l’accès' }).click();
      await trainerBrowser.page
        .getByText('Votre demande de correction attend la décision d’un administrateur ou manager.')
        .waitFor();

      const { body: managerView } = await classroomAccess(
        editableStageId,
        managerCookie,
        { method: 'GET' },
        'Lecture manager',
      );
      assert.equal(managerView?.editAccess?.canManage, true);
      assert.equal(managerView?.editAccess?.requests?.[0]?.status, 'pending');
      requestId = managerView?.editAccess?.requests?.[0]?.id;
      assert.equal(typeof requestId, 'string', 'Identifiant de demande absent');

      const approvedAt = Date.now();
      await managerBrowser.page.goto(`${appUrl}/classroom/${editableStageId}`, {
        waitUntil: 'domcontentloaded',
      });
      await managerBrowser.page.getByRole('combobox').click();
      await managerBrowser.page.getByRole('option', { name: '1 heure' }).click();
      await managerBrowser.page.getByRole('button', { name: 'Autoriser' }).click();
      await managerBrowser.page.getByText(/peut corriger cette formation jusqu’au/).waitFor();

      await trainerBrowser.page.reload({ waitUntil: 'domcontentloaded' });
      await trainerBrowser.page.getByText(/Correction autorisée jusqu’au/).waitFor();
      const { body: active } = await classroomAccess(
        editableStageId,
        trainerCookie,
        { method: 'GET' },
        'Lecture de la délégation active',
      );
      assert.equal(active?.editAccess?.requests?.[0]?.status, 'approved');
      approvedExpiresAt = active?.editAccess?.requests?.[0]?.expiresAt;
      const expiresAt = Date.parse(approvedExpiresAt);
      assert.ok(Number.isFinite(expiresAt), 'Expiration absente');
      assert.ok(expiresAt - approvedAt >= 59 * 60 * 1000, 'Durée accordée inférieure à une heure');
      assert.ok(expiresAt - approvedAt <= 61 * 60 * 1000, 'Durée accordée supérieure à une heure');

      const delegatedName = 'Formation corrigée par délégation S6-032';
      await renameClassroom(editableStageId, trainerCookie, delegatedName, 200);
      await renameClassroom(isolatedStageId, trainerCookie, 'Violation d’isolation', 403);

      await managerBrowser.page.reload({ waitUntil: 'domcontentloaded' });
      await managerBrowser.page.getByRole('button', { name: 'Révoquer' }).click();
      await managerBrowser.page.getByText(/peut corriger cette formation jusqu’au/).waitFor({
        state: 'hidden',
      });
      await renameClassroom(editableStageId, trainerCookie, 'Modification après révocation', 403);

      const { body: stored } = await request(
        `${supabaseUrl}/rest/v1/stages?id=eq.${encodeURIComponent(editableStageId)}&select=name`,
        { headers: serviceHeaders },
        'Relecture de la correction persistée',
      );
      assert.equal(stored?.[0]?.name, delegatedName);
    } finally {
      await trainerBrowser.context.close();
      await managerBrowser.context.close();
    }
  } finally {
    await browser.close();
  }

  assert.equal(typeof requestId, 'string');
  assert.equal(typeof approvedExpiresAt, 'string');

  console.log(
    JSON.stringify({
      proof: 'S6032_PRODUCTION_RECIPE_OK',
      requestCreated: true,
      managerApprovedFromBrowser: true,
      trainerObservedGrantFromBrowser: true,
      managerApprovedOneHour: true,
      delegatedClassroomEdited: true,
      secondClassroomIsolated: true,
      revokedAccessRejected: true,
      managerRevokedFromBrowser: true,
      persistedCorrectionReadBack: true,
    }),
  );
} finally {
  await cleanup();
}

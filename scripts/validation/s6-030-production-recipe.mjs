import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const required = ['QALEM_SUPABASE_ANON_KEY', 'QALEM_SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variable requise absente : ${name}`);
}
if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S6-030-HUMAN-YO-IMPACT') {
  throw new Error('Confirmation de recette de production absente');
}

const supabaseUrl = process.env.QALEM_SUPABASE_URL ?? 'https://db.qalem.ma';
const appUrl = process.env.QALEM_APP_URL ?? 'https://qalem.ma';
const orgId = process.env.QALEM_RECIPE_ORG_ID ?? 'aa7870b7-3938-4f24-b8bf-4a9d73565ba7';
const tenantAdminEmail = process.env.QALEM_RECIPE_TENANT_ADMIN ?? 'info@humanyoimpact.com';
const superAdminEmail = process.env.QALEM_RECIPE_SUPER_ADMIN ?? 'Amine@qalem.ma';
const anonKey = process.env.QALEM_SUPABASE_ANON_KEY;
const serviceKey = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const recipeId = `s6030-${Date.now()}-${randomUUID()}`;
const memberEmail = `${recipeId}@example.invalid`;
const memberPassword = randomBytes(32).toString('base64url');
let memberId = null;

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function jsonRequest(url, init, label) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
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

async function validateProfileLedger(session, expectedEmpty) {
  const browser = await chromium.launch({ headless: true });
  try {
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
    const page = await context.newPage();
    await page.goto(`${appUrl}/profile?orgId=${encodeURIComponent(orgId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const ledger = page.locator(
      'section[aria-label="Crédits et historique"], section[aria-label="Credits and history"], section[aria-label="الاعتمادات والسجل"]',
    );
    try {
      await ledger.waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      const rendered = (await page.locator('body').innerText()).slice(0, 500).replaceAll('\n', ' ');
      throw new Error(`Ledger absent du profil ${page.url()} : ${rendered}`);
    }
    const emptyLabels = [
      'Aucune écriture de crédit.',
      'No credit entry.',
      'لا توجد قيود اعتمادات.',
    ];
    const expectedContent = expectedEmpty
      ? ledger.getByText(/Aucune écriture de crédit|No credit entry|لا توجد قيود اعتمادات/)
      : ledger.getByText('Consommation fournisseur mesurée');
    await expectedContent.first().waitFor({ state: 'visible', timeout: 30_000 });
    const text = await ledger.innerText();
    if (expectedEmpty && !emptyLabels.some((label) => text.includes(label))) {
      throw new Error('Le profil membre expose une écriture étrangère');
    }
    if (!expectedEmpty && !text.includes('Consommation fournisseur mesurée')) {
      throw new Error('Le profil administrateur ne rend pas la consommation réelle');
    }
    return true;
  } finally {
    await browser.close();
  }
}

async function magicLinkSession(email) {
  const { body: link } = await jsonRequest(
    `${supabaseUrl}/auth/v1/admin/generate_link`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirectTo: `${appUrl}/profile` },
      }),
    },
    'Génération du lien de recette',
  );
  const tokenHash = link?.hashed_token;
  if (typeof tokenHash !== 'string' || tokenHash.length === 0) {
    throw new Error('Jeton de recette absent');
  }
  const { body: session } = await jsonRequest(
    `${supabaseUrl}/auth/v1/verify`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    },
    'Vérification du lien de recette',
  );
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error('Session de recette incomplète');
  }
  return session;
}

async function passwordSession(email, password) {
  const { body: session } = await jsonRequest(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    'Connexion du membre de recette',
  );
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error('Session membre de recette incomplète');
  }
  return session;
}

async function readCredits(cookie) {
  const { body } = await jsonRequest(
    `${appUrl}/api/billing/credits?orgId=${encodeURIComponent(orgId)}`,
    { headers: { cookie } },
    'Lecture du ledger',
  );
  return body;
}

async function postRpc(name, payload) {
  const { body } = await jsonRequest(
    `${supabaseUrl}/rest/v1/rpc/${name}`,
    { method: 'POST', headers: serviceHeaders, body: JSON.stringify(payload) },
    `RPC ${name}`,
  );
  return body;
}

async function cleanupMember() {
  if (!memberId) return;
  await fetch(
    `${supabaseUrl}/rest/v1/org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers: serviceHeaders, signal: AbortSignal.timeout(30_000) },
  ).catch(() => undefined);
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
    headers: serviceHeaders,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
}

try {
  const tenantAdminSession = await magicLinkSession(tenantAdminEmail);
  const superAdminSession = await magicLinkSession(superAdminEmail);

  const { body: memberUser } = await jsonRequest(
    `${supabaseUrl}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email: memberEmail,
        password: memberPassword,
        email_confirm: true,
        user_metadata: { nickname: 'Recette S6-030' },
      }),
    },
    'Création du membre de recette',
  );
  memberId = memberUser?.id;
  if (!memberId) throw new Error('Identifiant du membre de recette absent');
  await jsonRequest(
    `${supabaseUrl}/rest/v1/org_members`,
    {
      method: 'POST',
      headers: { ...serviceHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({ org_id: orgId, user_id: memberId, role: 'apprenant' }),
    },
    'Ajout du membre de recette',
  );
  const memberSession = await passwordSession(memberEmail, memberPassword);

  const tenantAdminCookie = sessionCookie(tenantAdminSession);
  const superAdminCookie = sessionCookie(superAdminSession);
  const memberCookie = sessionCookie(memberSession);
  const [tenantAdminProfileVisible, superAdminProfileVisible, memberProfileVisible] =
    await Promise.all([
      validateProfileLedger(tenantAdminSession, false),
      validateProfileLedger(superAdminSession, false),
      validateProfileLedger(memberSession, true),
    ]);
  const before = await readCredits(tenantAdminCookie);
  const startedAt = new Date().toISOString();
  const operationKey = `${recipeId}-serper`;
  const { response: searchResponse, body: searchBody } = await jsonRequest(
    `${appUrl}/api/web-search`,
    {
      method: 'POST',
      headers: {
        cookie: tenantAdminCookie,
        'content-type': 'application/json',
        'idempotency-key': operationKey,
      },
      body: JSON.stringify({
        orgId,
        providerId: 'serper',
        query: 'Qalem apprentissage multi-agents',
      }),
    },
    'Recherche fournisseur réelle',
  );
  if (searchBody?.success !== true) throw new Error('Recherche fournisseur non confirmée');

  const reservationUrl = new URL(`${supabaseUrl}/rest/v1/tenant_usage_reservations`);
  reservationUrl.searchParams.set(
    'select',
    'id,actor_user_id,operation_key,status,actual_quantity,actual_credit_microunits,valuation_status,valuation_issue',
  );
  reservationUrl.searchParams.set('org_id', `eq.${orgId}`);
  reservationUrl.searchParams.set('actor_user_id', `eq.${tenantAdminSession.user.id}`);
  reservationUrl.searchParams.set('created_at', `gte.${startedAt}`);
  reservationUrl.searchParams.set('order', 'created_at.asc');
  const { body: reservations } = await jsonRequest(
    reservationUrl,
    { headers: serviceHeaders },
    'Lecture des réservations réelles',
  );
  if (!Array.isArray(reservations) || reservations.length === 0) {
    throw new Error('Aucune réservation réelle créée');
  }
  const settledReservations = reservations.filter((row) => row.status === 'settled');
  if (settledReservations.length !== reservations.length) {
    throw new Error('Réservation réelle non réglée');
  }
  const settlementReplays = [];
  for (const reservation of settledReservations) {
    const replay = await postRpc('settle_tenant_usage', {
      p_actor: tenantAdminSession.user.id,
      p_reservation_id: reservation.id,
      p_actual_quantity: reservation.actual_quantity,
    });
    settlementReplays.push(Array.isArray(replay) ? replay[0] : replay);
  }
  if (settlementReplays.some((row) => row?.applied !== false)) {
    throw new Error('Le rejeu de règlement a créé une écriture');
  }

  const balanceBeforeFailure = (await readCredits(tenantAdminCookie)).balanceMicrounits;
  const failedOperationKey = `${recipeId}-provider-failure`;
  const reserved = await postRpc('reserve_tenant_usage', {
    p_actor: tenantAdminSession.user.id,
    p_org_id: orgId,
    p_operation_key: failedOperationKey,
    p_billable_unit: 'operation',
    p_max_quantity: 1,
    p_provider_id: 'recette-fournisseur-indisponible',
    p_model_id: 'recette-echec',
    p_provider_cost_currency: 'USD',
    p_idempotency_stable: true,
  });
  const reservedRow = Array.isArray(reserved) ? reserved[0] : reserved;
  const released = await postRpc('release_tenant_usage', {
    p_actor: tenantAdminSession.user.id,
    p_reservation_id: reservedRow?.reservation_id,
    p_reason: 'Recette contrôlée d’indisponibilité fournisseur S6-030',
  });
  const releaseReplay = await postRpc('release_tenant_usage', {
    p_actor: tenantAdminSession.user.id,
    p_reservation_id: reservedRow?.reservation_id,
    p_reason: 'Recette contrôlée d’indisponibilité fournisseur S6-030',
  });
  const releasedRow = Array.isArray(released) ? released[0] : released;
  const releaseReplayRow = Array.isArray(releaseReplay) ? releaseReplay[0] : releaseReplay;
  const balanceAfterFailure = (await readCredits(tenantAdminCookie)).balanceMicrounits;
  if (
    releasedRow?.applied !== true ||
    releaseReplayRow?.applied !== false ||
    balanceAfterFailure !== balanceBeforeFailure
  ) {
    throw new Error('Le remboursement d’échec n’est pas intégral ou idempotent');
  }

  const [tenantAdminView, superAdminView, memberView] = await Promise.all([
    readCredits(tenantAdminCookie),
    readCredits(superAdminCookie),
    readCredits(memberCookie),
  ]);
  const recipeEntries = (tenantAdminView.entries ?? []).filter((entry) =>
    String(entry.reference_id ?? '').includes(recipeId),
  );
  if (
    tenantAdminView.scope !== 'tenant' ||
    superAdminView.scope !== 'tenant' ||
    memberView.scope !== 'personal' ||
    (memberView.entries ?? []).length !== 0 ||
    recipeEntries.length === 0
  ) {
    throw new Error('La visibilité par rôle ne respecte pas le contrat');
  }
  console.log(
    JSON.stringify({
      recipeId,
      providerHttpStatus: searchResponse.status,
      providerSourceCount: Array.isArray(searchBody.sources) ? searchBody.sources.length : 0,
      balanceBeforeCredits: before.balanceCredits,
      balanceAfterCredits: tenantAdminView.balanceCredits,
      settledReservationCount: settledReservations.length,
      settlementReplayApplied: settlementReplays.map((row) => row?.applied),
      valuationStatuses: settledReservations.map((row) => row.valuation_status),
      valuationIssues: settledReservations.map((row) => row.valuation_issue),
      failureRefundMicrounits: releasedRow.refunded_credit_microunits,
      failureBalanceRestored: balanceAfterFailure === balanceBeforeFailure,
      releaseReplayApplied: releaseReplayRow.applied,
      tenantAdminScope: tenantAdminView.scope,
      superAdminScope: superAdminView.scope,
      memberScope: memberView.scope,
      memberEntryCount: (memberView.entries ?? []).length,
      recipeEntryCount: recipeEntries.length,
      tenantAdminProfileVisible,
      superAdminProfileVisible,
      memberProfileVisible,
    }),
  );
} finally {
  await cleanupMember();
}

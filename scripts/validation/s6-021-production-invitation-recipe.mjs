import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const required = ['QALEM_SUPABASE_ANON_KEY', 'QALEM_SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variable requise absente : ${name}`);
}
if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S6-021-INVITATION') {
  throw new Error('Confirmation de recette de production absente');
}

const supabaseUrl = process.env.QALEM_SUPABASE_URL ?? 'https://db.qalem.ma';
const appUrl = process.env.QALEM_APP_URL ?? 'https://qalem.ma';
const superAdminEmail = process.env.QALEM_RECIPE_SUPER_ADMIN ?? 'Amine@qalem.ma';
const anonKey = process.env.QALEM_SUPABASE_ANON_KEY;
const serviceKey = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const runId = randomUUID();
const invitedEmail = `delivered+s6021-${runId}@resend.dev`;
const rejectedEmail = `mismatch+s6021-${runId}@example.invalid`;
const blockedEmail = `blocked+s6021-${runId}@example.invalid`;
const password = `${randomBytes(24).toString('base64url')}aA7!`;
const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

let tenantId;
let invitedUserId;
let blockedUserId;

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body };
}

async function expectJson(url, init, expectedStatus, label) {
  const result = await request(url, init);
  assert.equal(result.response.status, expectedStatus, `${label}: HTTP inattendu`);
  return result.body;
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

async function magicLinkSession(email) {
  const usersUrl = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  usersUrl.searchParams.set('page', '1');
  usersUrl.searchParams.set('per_page', '1000');
  const users = await expectJson(
    usersUrl,
    { headers: serviceHeaders },
    200,
    'Lecture des utilisateurs',
  );
  assert.ok(
    users?.users?.some((user) => user.email?.toLowerCase() === email.toLowerCase()),
    'Le super-administrateur de recette n’existe pas',
  );

  const link = await expectJson(
    `${supabaseUrl}/auth/v1/admin/generate_link`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ type: 'magiclink', email }),
    },
    200,
    'Génération de la session super-administrateur',
  );
  assert.equal(typeof link?.hashed_token, 'string', 'Jeton de session absent');

  const session = await expectJson(
    `${supabaseUrl}/auth/v1/verify`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    },
    200,
    'Vérification de la session super-administrateur',
  );
  assert.ok(session?.access_token && session?.refresh_token, 'Session incomplète');
  return session;
}

async function countRows(table, filters) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, `eq.${value}`);
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { ...serviceHeaders, prefer: 'count=exact' },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `Comptage ${table}: HTTP ${response.status}`);
  const total = response.headers.get('content-range')?.split('/')[1];
  assert.ok(total && total !== '*', `Comptage ${table}: total absent`);
  return Number(total);
}

async function findUserId(email) {
  const url = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '1000');
  const users = await expectJson(url, { headers: serviceHeaders }, 200, 'Lecture Auth');
  return users?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id;
}

async function cleanup() {
  const failures = [];
  if (tenantId) {
    const url = new URL(`${supabaseUrl}/rest/v1/organizations`);
    url.searchParams.set('id', `eq.${tenantId}`);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: serviceHeaders,
      signal: AbortSignal.timeout(30_000),
    }).catch((error) => ({ ok: false, status: 0, error }));
    if (!response.ok) failures.push(`tenant:${response.status}`);
  }
  for (const userId of [invitedUserId, blockedUserId].filter(Boolean)) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders,
      signal: AbortSignal.timeout(30_000),
    }).catch((error) => ({ ok: false, status: 0, error }));
    if (!response.ok) failures.push(`user:${response.status}`);
  }
  if (failures.length) throw new Error(`Nettoyage incomplet : ${failures.join(',')}`);
}

let recipeError;
try {
  const settings = await expectJson(
    `${supabaseUrl}/auth/v1/settings`,
    { headers: { apikey: anonKey } },
    200,
    'Lecture de la configuration Auth',
  );
  assert.equal(settings?.disable_signup, true, 'L’inscription publique est active');

  const blockedSignup = await request(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: blockedEmail, password }),
  });
  blockedUserId = await findUserId(blockedEmail);
  assert.equal(blockedSignup.response.status, 422, 'Une inscription publique a été acceptée');
  assert.equal(blockedSignup.body?.error_code, 'signup_disabled', 'Motif de refus inattendu');
  assert.equal(blockedUserId, undefined, 'Un compte public orphelin a été créé');

  const anonymousApp = await fetch(`${appUrl}/app`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok([307, 308].includes(anonymousApp.status), 'L’accès anonyme à /app n’est pas redirigé');
  assert.equal(
    new URL(anonymousApp.headers.get('location'), appUrl).pathname,
    '/auth',
    'L’accès anonyme ne rejoint pas l’authentification',
  );

  const adminSession = await magicLinkSession(superAdminEmail);
  const adminCookie = `sb-db-auth-token=${sessionCookieValue(adminSession)}`;
  const tenant = await expectJson(
    `${appUrl}/api/admin/tenants`,
    {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `S6-021 recette ${runId}`,
        sector: 'education',
        defaultLocale: 'fr-FR',
        seatLimit: 3,
        administratorEmail: invitedEmail,
      }),
    },
    201,
    'Création du tenant et de son invitation',
  );
  tenantId = tenant?.tenant?.id;
  assert.equal(typeof tenantId, 'string', 'Tenant de recette absent');
  assert.equal(tenant?.administratorInvitationEmailSent, true, 'E-mail non accepté par Resend');
  const invitationUrl = new URL(tenant?.administratorInvitationUrl);
  assert.equal(invitationUrl.origin, appUrl, 'Origine de l’invitation incorrecte');
  const token = invitationUrl.searchParams.get('invite');
  assert.ok(token, 'Jeton d’invitation absent');

  await expectJson(
    `${appUrl}/api/invitations/signup`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: rejectedEmail, password }),
    },
    403,
    'Refus de la mauvaise adresse',
  );
  assert.equal(await findUserId(rejectedEmail), undefined, 'Compte créé pour la mauvaise adresse');

  await expectJson(
    `${appUrl}/api/invitations/signup`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: invitedEmail, password }),
    },
    201,
    'Inscription nominative',
  );
  invitedUserId = await findUserId(invitedEmail);
  assert.ok(invitedUserId, 'Compte invité absent après inscription');

  await expectJson(
    `${appUrl}/api/invitations/signup`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: invitedEmail, password }),
    },
    410,
    'Refus du rejeu de l’invitation',
  );

  const invitedSession = await expectJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: invitedEmail, password }),
    },
    200,
    'Connexion du compte invité',
  );
  assert.equal(invitedSession?.user?.id, invitedUserId, 'Identité connectée divergente');
  const invitedCookie = `sb-db-auth-token=${sessionCookieValue(invitedSession)}`;
  const organizations = await expectJson(
    `${appUrl}/api/organizations`,
    { headers: { cookie: invitedCookie } },
    200,
    'Lecture des organisations du compte invité',
  );
  const membership = organizations?.organizations?.find((org) => org.id === tenantId);
  assert.equal(membership?.userRole, 'admin', 'Adhésion administrateur absente');
  assert.equal(await countRows('org_members', { org_id: tenantId }), 1, 'Adhésion dupliquée');
  assert.equal(
    await countRows('org_invitations', { org_id: tenantId }),
    1,
    'Invitation divergente',
  );

  console.log(
    JSON.stringify({
      disableSignup: true,
      anonymousAppRedirected: true,
      publicSignupRejected: true,
      invitationEmailAcceptedByResend: true,
      mismatchedEmailRejected: true,
      invitationSignupCreated: true,
      administratorMembership: true,
      replayRejected: true,
    }),
  );
} catch (error) {
  recipeError = error;
} finally {
  try {
    await cleanup();
    if (tenantId) {
      assert.equal(await countRows('organizations', { id: tenantId }), 0, 'Tenant résiduel');
      assert.equal(await countRows('org_members', { org_id: tenantId }), 0, 'Adhésion résiduelle');
      assert.equal(
        await countRows('org_invitations', { org_id: tenantId }),
        0,
        'Invitation résiduelle',
      );
    }
    assert.equal(await findUserId(invitedEmail), undefined, 'Compte invité résiduel');
    assert.equal(await findUserId(blockedEmail), undefined, 'Compte public résiduel');
  } catch (cleanupError) {
    recipeError = recipeError
      ? new AggregateError([recipeError, cleanupError], 'Recette et nettoyage en échec')
      : cleanupError;
  }
}

if (recipeError) throw recipeError;
console.log(JSON.stringify({ cleanupVerified: true }));

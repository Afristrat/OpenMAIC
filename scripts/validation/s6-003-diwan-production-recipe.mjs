import assert from 'node:assert/strict';

const required = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  assert.ok(process.env[name], `Variable requise absente : ${name}`);
}

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qalem.ma';
const organizationId = process.env.QALEM_RECIPE_ORG_ID || 'aa7870b7-3938-4f24-b8bf-4a9d73565ba7';
const tenantAdminEmail = process.env.QALEM_RECIPE_TENANT_ADMIN || 'info@humanyoimpact.com';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(supabaseUrl, 'URL Supabase absente');
assert.equal(
  process.env.QALEM_PRODUCTION_RECIPE_CONFIRM,
  'S6-003-DIWAN-HUMAN-YO-IMPACT',
  'Confirmation de recette de production absente',
);

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function requestJson(url, init, label) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return { response, body };
}

async function assertExistingUser(email) {
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL('/auth/v1/admin/users', supabaseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');
    const { body } = await requestJson(
      url,
      { headers: serviceHeaders },
      'Lecture des utilisateurs',
    );
    const users = Array.isArray(body?.users) ? body.users : [];
    if (users.some((user) => user?.email?.toLowerCase() === email.toLowerCase())) return;
    if (users.length < 100) break;
  }
  throw new Error('Le compte administrateur du tenant doit exister avant la recette');
}

function sessionCookies(session) {
  const encoded = `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
    }),
    'utf8',
  ).toString('base64url')}`;
  const chunkSize = 3180;
  if (encoded.length <= chunkSize) return `sb-db-auth-token=${encoded}`;
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    chunks.push(encoded.slice(offset, offset + chunkSize));
  }
  return chunks.map((value, index) => `sb-db-auth-token.${index}=${value}`).join('; ');
}

await assertExistingUser(tenantAdminEmail);

const { body: generated } = await requestJson(
  new URL('/auth/v1/admin/generate_link', supabaseUrl),
  {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({
      type: 'magiclink',
      email: tenantAdminEmail,
      options: { redirectTo: `${appUrl}/app?orgId=${encodeURIComponent(organizationId)}` },
    }),
  },
  'Génération de la session de recette',
);
assert.ok(generated?.hashed_token, 'Jeton de recette absent');

const { body: session } = await requestJson(
  new URL('/auth/v1/verify', supabaseUrl),
  {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: generated.hashed_token }),
  },
  'Vérification de la session de recette',
);
assert.ok(session?.access_token && session?.refresh_token, 'Session de recette incomplète');

const route = new URL(`/api/documents/diwan/${encodeURIComponent(organizationId)}`, appUrl);
route.searchParams.set('page', '1');
route.searchParams.set('pageSize', '20');

const anonymous = await fetch(route, {
  redirect: 'manual',
  signal: AbortSignal.timeout(30_000),
});
assert.equal(anonymous.status, 401, 'La route Qalem doit refuser une requête anonyme');

const { response, body } = await requestJson(
  route,
  { headers: { cookie: sessionCookies(session), accept: 'application/json' } },
  'Appel Qalem vers Diwan',
);
assert.equal(body?.contractVersion, '1.0', 'Version du contrat Diwan inattendue');
assert.ok(Array.isArray(body?.items), 'Liste de sources Diwan absente');
assert.equal(typeof body?.pagination?.total, 'number', 'Pagination Diwan absente');

process.stdout.write(
  `${JSON.stringify({
    anonymousStatus: anonymous.status,
    authenticatedStatus: response.status,
    existingTenantAdministrator: true,
    organizationScoped: true,
    contractVersion: body.contractVersion,
    sourceCount: body.items.length,
    totalSources: body.pagination.total,
  })}\n`,
);

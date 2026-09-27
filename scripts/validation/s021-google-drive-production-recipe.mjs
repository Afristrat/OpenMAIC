import assert from 'node:assert/strict';

const required = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) assert.ok(process.env[name], `Variable requise absente : ${name}`);

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qalem.ma';
const organizationId = process.env.QALEM_RECIPE_ORG_ID || 'aa7870b7-3938-4f24-b8bf-4a9d73565ba7';
const tenantAdminEmail = process.env.QALEM_RECIPE_TENANT_ADMIN || 'info@humanyoimpact.com';
const action = process.env.QALEM_S021_ACTION || 'inspect';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(supabaseUrl, 'URL Supabase absente');
assert.equal(
  process.env.QALEM_PRODUCTION_RECIPE_CONFIRM,
  'S-021-GOOGLE-DRIVE-HUMAN-YO-IMPACT',
  'Confirmation de recette de production absente',
);
assert.ok(['authorize', 'inspect', 'import', 'revoke'].includes(action), 'Action inconnue');

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function requestJson(url, init, label, expectedStatus = 200) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  const errorCode = typeof body?.errorCode === 'string' ? ` ${body.errorCode}` : '';
  assert.equal(response.status, expectedStatus, `${label} : HTTP ${response.status}${errorCode}`);
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
  for (let offset = 0; offset < encoded.length; offset += chunkSize)
    chunks.push(encoded.slice(offset, offset + chunkSize));
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
const anonymous = await fetch(route, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
assert.equal(anonymous.status, 401, 'La route Qalem doit refuser une requête anonyme');

const authenticatedHeaders = {
  cookie: sessionCookies(session),
  accept: 'application/json',
  'content-type': 'application/json',
  origin: new URL(appUrl).origin,
};
async function command(payload, label) {
  return requestJson(
    route,
    { method: 'POST', headers: authenticatedHeaders, body: JSON.stringify(payload) },
    label,
  );
}

const { body: connectorList } = await command(
  { operation: 'connector-list' },
  'Lecture des connecteurs',
);
assert.equal(connectorList?.contractVersion, '1.0', 'Version du contrat inattendue');
assert.ok(Array.isArray(connectorList?.connections), 'Liste des connexions absente');

if (action === 'authorize') {
  const { body } = await command(
    { operation: 'connector-authorize' },
    'Création de l’autorisation Google Drive',
  );
  const authorizationUrl = new URL(body?.authorizationUrl);
  assert.equal(authorizationUrl.protocol, 'https:');
  assert.equal(authorizationUrl.hostname, 'accounts.google.com');
  assert.equal(
    authorizationUrl.searchParams.get('redirect_uri'),
    'https://diwan.ai-mpower.com/api/v1/consumers/qalem/connectors/google-drive/callback',
  );
  assert.ok(
    authorizationUrl.searchParams
      .get('scope')
      ?.split(' ')
      .includes('https://www.googleapis.com/auth/drive.file'),
    'Périmètre Google Drive absent',
  );
  process.stdout.write(
    `${JSON.stringify({
      anonymousStatus: anonymous.status,
      existingTenantAdministrator: true,
      organizationScoped: true,
      authorizationUrl: authorizationUrl.toString(),
    })}\n`,
  );
} else if (action === 'inspect') {
  const query = process.env.QALEM_S021_QUERY || '';
  const { body } = await command(
    { operation: 'connector-search', query, pageSize: 20 },
    'Recherche Google Drive',
  );
  process.stdout.write(
    `${JSON.stringify({
      anonymousStatus: anonymous.status,
      organizationScoped: true,
      connectedAccounts: connectorList.connections.length,
      items: body?.items ?? [],
    })}\n`,
  );
} else if (action === 'import') {
  const externalIds = (process.env.QALEM_S021_EXTERNAL_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  assert.ok(externalIds.length > 0 && externalIds.length <= 20, 'Sélection Drive invalide');
  const { body } = await command(
    {
      operation: 'connector-import',
      externalIds,
      corpusName: 'Recette Google Drive S-021',
      idempotencyKey: process.env.QALEM_S021_IDEMPOTENCY_KEY || crypto.randomUUID(),
    },
    'Import Google Drive',
  );
  process.stdout.write(
    `${JSON.stringify({
      anonymousStatus: anonymous.status,
      organizationScoped: true,
      jobId: body?.jobId,
      status: body?.status,
    })}\n`,
  );
} else {
  const { body } = await command({ operation: 'connector-revoke' }, 'Révocation Google Drive');
  assert.equal(body?.status, 'revoked');
  process.stdout.write(
    `${JSON.stringify({
      anonymousStatus: anonymous.status,
      organizationScoped: true,
      status: body.status,
    })}\n`,
  );
}

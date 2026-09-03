import assert from 'node:assert/strict';
import { chmod, writeFile } from 'node:fs/promises';

const [outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Session output path is required');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.SUPER_ADMIN_EMAILS?.split(',')[0]?.trim();
assert.ok(serviceRoleKey, 'Supabase service role key is required');
assert.ok(anonKey, 'Supabase anonymous key is required');
assert.ok(supabaseUrl, 'Supabase URL is required');
assert.ok(email, 'A super-admin email is required');

const generationResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://qalem.ma/admin?tab=widgets' },
  }),
});
assert.equal(generationResponse.status, 200, 'Magic-link generation failed');
const generation = await generationResponse.json();
assert.equal(typeof generation.action_link, 'string', 'Magic-link generation returned no link');

const actionUrl = new URL(generation.action_link);
const verificationUrl = new URL(`${actionUrl.pathname}${actionUrl.search}`, supabaseUrl);
const verificationResponse = await fetch(verificationUrl, {
  redirect: 'manual',
  headers: { apikey: anonKey },
});
assert.ok(
  verificationResponse.status >= 300 && verificationResponse.status < 400,
  'Magic-link verification failed',
);
const redirectLocation = verificationResponse.headers.get('location');
assert.ok(redirectLocation, 'Magic-link verification returned no redirect');

const redirectUrl = new URL(redirectLocation, 'https://qalem.ma');
const authParameters = new URLSearchParams(redirectUrl.hash.slice(1));
const accessToken = authParameters.get('access_token');
const refreshToken = authParameters.get('refresh_token');
const expiresIn = Number(authParameters.get('expires_in'));
assert.ok(accessToken, 'Verified session returned no access token');
assert.ok(refreshToken, 'Verified session returned no refresh token');
assert.ok(Number.isFinite(expiresIn), 'Verified session returned no expiry');

const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
});
assert.equal(userResponse.status, 200, 'Verified session user lookup failed');
const user = await userResponse.json();
assert.equal(typeof user.id, 'string', 'Verified session returned no user');

const session = {
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: expiresIn,
  expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  token_type: authParameters.get('token_type') ?? 'bearer',
  user,
};
await writeFile(outputPath, JSON.stringify(session), { encoding: 'utf8', mode: 0o600 });
await chmod(outputPath, 0o600);
process.stdout.write('ephemeral-session-created\n');

import { createServer, type Server } from 'node:http';

// The E2E web server points NEXT_PUBLIC_SUPABASE_URL at 127.0.0.1:54321 (see playwright.config.ts)
// where nothing listens. Routes guarded by requireAuth() ask GoTrue `GET /auth/v1/user`, so API-level
// specs (which bypass page.route mocks) need a stand-in GoTrue and a session cookie.
const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 54321;
const SESSION_COOKIE = 'sb-db-auth-token';

const TEST_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@qalem.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function fakeJwt(expiresAt: number): string {
  const payload = {
    sub: TEST_USER.id,
    role: 'authenticated',
    aud: 'authenticated',
    exp: expiresAt,
  };
  return `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url(JSON.stringify(payload))}.e2e`;
}

/** Cookie header carrying a synthetic, unexpired session for the stand-in GoTrue. */
export function e2eSessionCookie(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: fakeJwt(expiresAt),
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: TEST_USER,
  };
  return `${SESSION_COOKIE}=base64-${base64Url(JSON.stringify(session))}`;
}

function listen(server: Server): Promise<boolean> {
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(AUTH_PORT, AUTH_HOST, () => resolve(true));
  });
}

/**
 * Starts the stand-in GoTrue. The port is the mutual-exclusion lock between Playwright workers:
 * a worker that finds it taken waits for the holder to close it, so it is never shared half-way.
 */
export async function startE2eAuthServer(timeoutMs = 90_000): Promise<() => Promise<void>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const server = createServer((req, res) => {
      const isUser = req.method === 'GET' && req.url?.startsWith('/auth/v1/user');
      res.writeHead(isUser ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(isUser ? TEST_USER : { error: 'not_found' }));
    });
    if (await listen(server)) {
      return () => new Promise((resolve) => server.close(() => resolve()));
    }
    if (Date.now() > deadline) throw new Error('E2E auth server port stayed busy');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const serverPath = resolve('.next/standalone/server.js');

if (!existsSync(serverPath)) {
  if (process.env.VERCEL || process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
    console.log('[assert-standalone-routes] skipped: standalone output is disabled');
    process.exit(0);
  }

  throw new Error(`[assert-standalone-routes] missing ${serverPath}`);
}

const port = 31_000 + (process.pid % 1_000);
const origin = `http://127.0.0.1:${port}`;
let serverOutput = '';

const server = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    NEXT_PUBLIC_E2E_TEST_MODE: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-4_000);
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(
        `[assert-standalone-routes] server exited with ${server.exitCode}\n${serverOutput}`,
      );
    }

    try {
      await fetch(`${origin}/auth`, { redirect: 'manual' });
      return;
    } catch {
      await delay(250);
    }
  }

  throw new Error(`[assert-standalone-routes] server did not become ready\n${serverOutput}`);
}

async function readRoute(pathname) {
  const response = await fetch(`${origin}${pathname}`, { redirect: 'manual' });
  return {
    pathname,
    status: response.status,
    location: response.headers.get('location'),
  };
}

try {
  await waitUntilReady();

  const routes = await Promise.all([readRoute('/'), readRoute('/auth'), readRoute('/app')]);
  const [home, auth, privateApp] = routes;

  if (home.status !== 200 || auth.status !== 200) {
    throw new Error(
      `[assert-standalone-routes] public route isolation failed: ${JSON.stringify(routes)}`,
    );
  }

  if (privateApp.status !== 307 || privateApp.location !== '/auth?next=/app') {
    throw new Error(
      `[assert-standalone-routes] private route guard failed: ${JSON.stringify(routes)}`,
    );
  }

  console.log('[assert-standalone-routes] ok: public routes stay public and /app stays private');
} finally {
  server.kill('SIGTERM');
}

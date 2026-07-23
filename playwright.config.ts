import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.E2E_PORT ?? '3002';
const e2eBaseUrl = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The Next.js server plus two Chromium workers saturate ServeurAI during
  // browser-media scenarios. That contention destroys IndexedDB contexts and
  // turns an otherwise valid suite into a non-deterministic gate. Use the same
  // bounded execution model locally and in CI so a green gate is reproducible.
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: e2eBaseUrl,
    // Playwright cannot route requests claimed by a service worker. Blocking
    // it keeps API-contract mocks deterministic across the E2E suite.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      process.env.E2E_PREBUILT === 'true'
        ? 'pnpm start:web'
        : process.env.CI
          ? 'pnpm build && pnpm start:web'
          : 'pnpm dev',
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Enable the MAIC Editor (Pro mode) so editor e2e can reach it. This is a
    // build-time NEXT_PUBLIC_* flag, so it must be set when the webServer runs
    // `pnpm build` (CI) or `pnpm dev` (local).
    env: {
      PORT: e2ePort,
      NEXT_PUBLIC_MAIC_EDITOR_ENABLED: 'true',
      NEXT_PUBLIC_E2E_TEST_MODE: 'true',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key',
    },
  },
});

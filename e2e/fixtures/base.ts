import { test as base } from '@playwright/test';
import { MockApi } from './mock-api';

type Fixtures = {
  mockApi: MockApi;
  rateLimitIdentity: void;
};

export const test = base.extend<Fixtures>({
  rateLimitIdentity: [
    async ({ page }, use, testInfo) => {
      // The proxy treats the forwarded value as an opaque bucket key after the
      // trusted reverse proxy. Give each E2E case its own anonymous bucket so a
      // full suite still exercises rate limiting without sharing one client's
      // 100-request window across unrelated browser journeys.
      await page.setExtraHTTPHeaders({ 'x-forwarded-for': `e2e:${testInfo.testId}` });
      await use();
    },
    { auto: true },
  ],
  mockApi: async ({ page }, use) => {
    const mockApi = new MockApi(page);
    // Always mock server-providers — called on every page load by root layout
    await mockApi.mockServerProviders();
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"isAdmin":false}' }),
    );
    // The authoring home loads the current organisation's catalog on mount.
    // Keep that background request inside the E2E boundary instead of letting
    // it reach the deliberately fake Supabase configured by Playwright.
    // Tests that exercise classroom persistence register a more specific route
    // afterwards and therefore retain full control of their own fixture.
    await page.route('**/api/classroom?orgId=*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true,"classrooms":[]}',
      }),
    );
    await use(mockApi);
  },
});

export { expect } from '@playwright/test';

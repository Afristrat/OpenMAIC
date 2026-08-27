import { expect, test as base } from '@playwright/test';
import { MockApi } from './mock-api';

type Fixtures = {
  browserConsoleContract: {
    expectHttpError(pathname: string, status: number): void;
  };
  mockApi: MockApi;
  rateLimitIdentity: void;
};

export const test = base.extend<Fixtures>({
  browserConsoleContract: [
    async ({ page }, use) => {
      const unexpected: string[] = [];
      const expectedHttpErrors: Array<{ pathname: string; status: number }> = [];
      const failedResponses: Array<{ url: string; status: number }> = [];
      const resourceErrors: Array<{ text: string; url: string }> = [];
      const onConsole = (message: {
        type(): string;
        text(): string;
        location(): { url: string };
      }) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          const location = message.location();
          if (message.type() === 'error' && message.text().startsWith('Failed to load resource:')) {
            resourceErrors.push({ text: message.text(), url: location.url });
            return;
          }
          unexpected.push(
            `${message.type()}: ${message.text()}${location.url ? ` @ ${location.url}` : ''}`,
          );
        }
      };
      const onPageError = (error: Error) => unexpected.push(`pageerror: ${error.message}`);
      const onResponse = (response: { status(): number; url(): string }) => {
        if (response.status() >= 400) {
          failedResponses.push({ url: response.url(), status: response.status() });
        }
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);

      await use({
        expectHttpError(pathname, status) {
          expectedHttpErrors.push({ pathname, status });
        },
      });

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
      for (const expectedHttpError of expectedHttpErrors) {
        const matchingResponses = failedResponses.filter((response) => {
          const url = new URL(response.url);
          return (
            url.pathname === expectedHttpError.pathname &&
            response.status === expectedHttpError.status
          );
        });
        expect(
          matchingResponses,
          `expected HTTP ${expectedHttpError.status} response for ${expectedHttpError.pathname}`,
        ).toHaveLength(1);
      }
      for (const resourceError of resourceErrors) {
        const pathname = resourceError.url ? new URL(resourceError.url).pathname : '';
        if (
          !expectedHttpErrors.some((expectedHttpError) => expectedHttpError.pathname === pathname)
        ) {
          unexpected.push(`error: ${resourceError.text} @ ${resourceError.url}`);
        }
      }
      expect(unexpected, 'unexpected browser console output').toEqual([]);
    },
    { auto: true },
  ],
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
  mockApi: [
    async ({ context, page }, use) => {
      const mockApi = new MockApi(page);
      // Always mock server-providers — called on every page load by root layout
      await mockApi.mockServerProviders();
      await mockApi.mockSourceLibrary();
      await context.route(/\/rest\/v1\/review_cards(?:\?.*)?$/, async (route) => {
        const method = route.request().method();
        if (method !== 'GET' && method !== 'HEAD') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0' },
          body: method === 'HEAD' ? '' : '[]',
        });
      });
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
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
